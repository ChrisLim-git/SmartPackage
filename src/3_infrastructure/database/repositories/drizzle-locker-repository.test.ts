import { createTestDb } from "@/test/support/test-db"
import { unwrap } from "@/test/support/unwrap"
import { eq } from "drizzle-orm"

import { SYSTEM_ACTOR } from "@application/interfaces/audit-context"
import { PackageSize } from "@domain/value-objects/size"

import { locker } from "../schema/locker"
import { lockerSize } from "../schema/locker-size"
import { station } from "../schema/station"
import { DrizzleLockerRepository } from "./drizzle-locker-repository"

const { pool, db } = createTestDb()

const repository = () => new DrizzleLockerRepository(db)

/**
 * Only the queries that make a decision.
 *
 * `findById` returning what was written is Drizzle's job, not this class's.
 * What is worth asserting is the scoping: which lockers a query is willing to
 * return, and which it silently must not.
 */
describe("DrizzleLockerRepository", () => {
  let central: string
  let harbour: string
  let small: string
  let large: string

  beforeAll(async () => {
    const sizes = await db
      .insert(lockerSize)
      .values([
        { code: "S", rank: 1, label: "Small" },
        { code: "L", rank: 3, label: "Large" },
      ])
      .returning()
    small = sizes.find((size) => size.code === "S")!.id
    large = sizes.find((size) => size.code === "L")!.id

    const stations = await db
      .insert(station)
      .values([
        { name: "Central Mall", address: "180 Bourke Street" },
        { name: "Riverside Offices", address: "8 Riverside Quay" },
      ])
      .returning()
    central = stations.find((row) => row.name === "Central Mall")!.id
    harbour = stations.find((row) => row.name === "Riverside Offices")!.id

    await db.insert(locker).values([
      { stationId: central, sizeId: small, label: "S1" },
      { stationId: central, sizeId: small, label: "S2", status: "occupied" },
      { stationId: central, sizeId: large, label: "L1" },
      // Same label as one at Central: unique per station, not globally.
      { stationId: harbour, sizeId: small, label: "S1" },
    ])
  })

  afterAll(async () => {
    await pool.query("DELETE FROM locker")
    await pool.query("DELETE FROM station")
    await pool.query("DELETE FROM locker_size")
    await pool.end()
  })

  it("offers only the free lockers at the station asked for", async () => {
    const available = await repository().findAvailableAtStation(central)

    // S2 is occupied and Riverside's S1 belongs to somewhere else.
    expect(available.map((found) => found.label)).toEqual(["S1", "L1"])
  })

  it("orders candidates smallest first, so the caller sees what it will get", async () => {
    const available = await repository().findAvailableAtStation(central)

    expect(available.map((found) => found.size.code)).toEqual(["S", "L"])
  })

  it("resolves a label within its own station, not across the network", async () => {
    const atCentral = await repository().findByLabel(central, "S1")
    const atHarbour = await repository().findByLabel(harbour, "S1")

    expect(atCentral?.stationId).toBe(central)
    expect(atHarbour?.stationId).toBe(harbour)
    expect(atCentral?.id).not.toBe(atHarbour?.id)
  })

  it("lists occupied lockers too, so a full station looks full", async () => {
    const all = await repository().findAllWithAvailability(central)

    expect(all).toHaveLength(3)
    expect(all.filter((found) => !found.isAvailable())).toHaveLength(1)
  })

  it("reads an occupied locker back occupied", async () => {
    const [occupied] = await repository()
      .findAllWithAvailability(central)
      .then((all) => all.filter((found) => !found.isAvailable()))

    // Through `create` this would come back available, and a full locker would
    // be handed out to the next package.
    expect(occupied.label).toBe("S2")
    expect(occupied.isAvailable()).toBe(false)
  })

  it("hides a soft-deleted locker from every read", async () => {
    const [target] = await db
      .insert(locker)
      .values({ stationId: harbour, sizeId: large, label: "L9" })
      .returning()

    await db
      .update(locker)
      .set({ deletedAt: new Date() })
      .where(eq(locker.id, target.id))

    expect(await repository().findById(target.id)).toBeNull()
    expect(await repository().findByLabel(harbour, "L9")).toBeNull()
    expect(
      (await repository().findAvailableAtStation(harbour)).map((l) => l.label)
    ).not.toContain("L9")
  })

  it("refuses to claim a locker until the claim can be made atomic", async () => {
    // The placeholder is deliberate: a claim built from a read plus a write
    // would pass this suite and lose a locker under contention.
    const size = unwrap(
      PackageSize.create({ code: "S", rank: 1, label: "Small" })
    )

    await expect(
      repository().claimSmallestFitting(central, size, SYSTEM_ACTOR)
    ).rejects.toThrow(/T501/)
  })
})
