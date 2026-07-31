import { Package } from "@domain/entities/package"
import { Money } from "@domain/utils/money"
import { PickupCode } from "@domain/utils/pickup-code"
import { PackageSize } from "@domain/utils/size"

import { FixedClock } from "@/utils/fake-clocks"
import { FakePickupCodeHasher } from "@/utils/fake-pickup-code-hasher"
import {
  clearNetwork,
  type Network,
  seedNetwork,
} from "@/utils/network-fixture"
import { createTestDb } from "@/utils/test-db"
import { unwrap } from "@/utils/unwrap"

import { UuidV7Generator } from "@/utils/uuid-v7-generator"
import { PackageRepository } from "./repositories/package-repository"
import { UnitOfWork } from "./unit-of-work"

const { pool, db } = createTestDb()

const ids = new UuidV7Generator()
const hasher = new FakePickupCodeHasher()
const STORED_AT = new Date("2026-03-01T09:00:00.000Z")
const RETRIEVED_AT = new Date("2026-03-03T09:00:00.000Z")

/**
 * The only place transaction semantics are proved rather than assumed: a
 * collection flips the parcel and frees the locker, and half of that is
 * corruption either way.
 */
describe("UnitOfWork", () => {
  let network: Network

  beforeEach(async () => {
    await clearNetwork(pool)
    network = await seedNetwork(pool, db)
  })

  afterAll(async () => {
    await clearNetwork(pool)
    await pool.end()
  })

  const size = () =>
    unwrap(PackageSize.create({ code: "S", rank: 1, label: "Small" }))

  const storeParcel = async () => {
    const parcel = unwrap(
      Package.store({
        id: ids.next(),
        customerId: network.customerId,
        size: size(),
        lockerId: network.lockerIds["S1"],
        code: unwrap(PickupCode.create("K4M9PT")),
        hasher,
        clock: new FixedClock(STORED_AT),
      })
    )

    await new PackageRepository(db).save(parcel, {
      actingUserId: network.agentId,
    })
    await pool.query("UPDATE locker SET status = 'occupied' WHERE id = $1", [
      network.lockerIds["S1"],
    ])

    return parcel
  }

  const stateOf = async (parcelId: string) => {
    const { rows } = await pool.query<{
      status: string
      locker: string
      fee: string | null
    }>(
      `SELECT p.status, p.fee_charged AS fee, l.status AS locker
         FROM package p JOIN locker l ON l.id = p.locker_id
        WHERE p.id = $1`,
      [parcelId]
    )

    return rows[0]
  }

  const collect = (parcel: Package) =>
    unwrap(
      parcel.retrieve(RETRIEVED_AT, unwrap(Money.fromDecimalString("4.00")))
    )

  it("commits the collection as one change", async () => {
    const parcel = await storeParcel()
    const uow = new UnitOfWork(db, ids)

    await uow.run(async ({ lockers, packages }) => {
      await lockers.release(parcel.lockerId, { actingUserId: null })
      await packages.save(collect(parcel), { actingUserId: null })
    })

    // The fee as the column holds it: a `numeric` string, never a float.
    expect(await stateOf(parcel.id)).toEqual({
      status: "retrieved",
      locker: "available",
      fee: "4.00",
    })
  })

  it("leaves neither change behind when the work throws", async () => {
    const parcel = await storeParcel()
    const uow = new UnitOfWork(db, ids)

    await expect(
      uow.run(async ({ lockers, packages }) => {
        await packages.save(collect(parcel), { actingUserId: null })
        await lockers.release(parcel.lockerId, { actingUserId: null })
        throw new Error("the door would not open")
      })
    ).rejects.toThrow("the door would not open")

    // Neither write survives — a half-applied collection corrupts either way.
    expect(await stateOf(parcel.id)).toEqual({
      status: "stored",
      locker: "occupied",
      fee: null,
    })
  })

  it("gives every repository in one run the same transaction", async () => {
    const parcel = await storeParcel()
    const uow = new UnitOfWork(db, ids)

    await uow.run(async ({ lockers, packages }) => {
      await lockers.release(parcel.lockerId, { actingUserId: null })

      // Must see the uncommitted release — a pool-bound repository would read
      // around the transaction and still say "occupied".
      expect((await lockers.findById(parcel.lockerId))?.isAvailable()).toBe(
        true
      )
      await packages.save(collect(parcel), { actingUserId: null })
    })
  })

  it("refuses to nest rather than quietly taking a second connection", async () => {
    const parcel = await storeParcel()
    const uow = new UnitOfWork(db, ids)

    await expect(
      uow.run(async ({ lockers }) => {
        await lockers.release(parcel.lockerId, { actingUserId: null })

        // A nested `run` would take a second connection and an unrelated
        // transaction — it fails loudly instead of pretending to be a savepoint.
        await uow.run(async () => undefined)
      })
    ).rejects.toThrow(/nest/)

    expect(await stateOf(parcel.id)).toEqual({
      status: "stored",
      locker: "occupied",
      fee: null,
    })
  })
})
