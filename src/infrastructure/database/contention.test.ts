import { eq } from "drizzle-orm"

import { OrdinalFitService } from "@domain/services/ordinal-fit-service"
import { RetrievePackageService } from "@domain/services/retrieve-package-service"
import { SmallestFitFirstService } from "@domain/services/smallest-fit-first-service"
import { StorePackageService } from "@domain/services/store-package-service"
import { TieredDailyRateFeeService } from "@domain/services/tiered-daily-rate-fee-service"
import { isErr, isOk } from "@domain/shared/result"
import { PackageSize } from "@domain/utils/size"

import {
  clearNetwork,
  type Network,
  seedNetwork,
} from "@/utils/network-fixture"
import { HmacPickupCodeHasher } from "@/utils/pickup-code-hasher"
import { RandomPickupCodeGenerator } from "@/utils/random-pickup-code-generator"
import { SystemClock } from "@/utils/system-clock"
import { createTestDb } from "@/utils/test-db"
import { unwrap } from "@/utils/unwrap"
import { UuidV7Generator } from "@/utils/uuid-v7-generator"

import { locker } from "./schema/locker"
import { feeTier, pricingConfig } from "./schema/pricing"
import { LockerRepository } from "./repositories/locker-repository"
import { LockerSizeRepository } from "./repositories/locker-size-repository"
import { PricingRepository } from "./repositories/pricing-repository"
import { StationRepository } from "./repositories/station-repository"
import { UnitOfWork } from "./unit-of-work"

/**
 * The locker invariant under real parallelism: at most one package per locker.
 * Pool width 20 so twenty transactions genuinely overlap; isolation by
 * truncation, because a wrapping transaction would serialise the contention
 * under test. Real Postgres, never PGlite — PGlite serialises transactions, so
 * `SKIP LOCKED` never skips and a broken claim goes green.
 */
const { pool, db } = createTestDb({ max: 20 })

const ids = new UuidV7Generator()
const codes = new RandomPickupCodeGenerator()
const hasher = new HmacPickupCodeHasher()
const clock = new SystemClock()
const selection = new SmallestFitFirstService(new OrdinalFitService())

const CONCURRENT = 20

const storePackage = () =>
  new StorePackageService({
    stations: new StationRepository(db),
    lockerSizes: new LockerSizeRepository(db),
    codes,
    hasher,
    ids,
    clock,
    uow: new UnitOfWork(db, ids),
  })

/** A latch every caller waits at, so all of them read before any of them writes. */
const barrier = (participants: number) => {
  let arrived = 0
  let release = () => {}
  const open = new Promise<void>((resolve) => {
    release = resolve
  })

  return async () => {
    arrived += 1
    if (arrived >= participants) release()
    await open
  }
}

/** File-level, so it runs after both describes — the pool dies exactly once. */
afterAll(async () => {
  await pool.query("DELETE FROM fee_tier")
  await pool.query("DELETE FROM pricing_config")
  await clearNetwork(pool)
  await pool.end()
})

describe("storing packages under contention", () => {
  let network: Network

  const command = (packageSizeCode: string) => ({
    stationId: network.stationId,
    recipient: { name: "Ada Lovelace", email: "ada@fixture.test" },
    packageSizeCode,
    audit: { actingUserId: network.agentId },
  })

  const seed = async (counts: Record<string, number>) => {
    await clearNetwork(pool)
    network = await seedNetwork(pool, db, counts)
  }

  /** The invariant, in SQL: any locker holding more than one stored parcel. */
  const doubleBooked = async () => {
    const { rows } = await pool.query(
      `SELECT locker_id, count(*) AS stored
         FROM package
        WHERE status = 'stored'
        GROUP BY locker_id
       HAVING count(*) > 1`
    )

    return rows
  }

  const availability = async () => {
    const { rows } = await pool.query<{ status: string; count: string }>(
      `SELECT status, count(*) AS count FROM locker GROUP BY status`
    )

    return Object.fromEntries(
      rows.map((row) => [row.status, Number(row.count)])
    )
  }

  const smallPackage = async () => {
    const [small] = await new LockerSizeRepository(db).findAll()

    return unwrap(
      PackageSize.create({
        code: small.code,
        rank: small.rank,
        label: small.label,
      })
    )
  }

  // Five runs: one pass shows only one interleaving.
  it.each([1, 2, 3, 4, 5])(
    "gives twenty agents exactly three lockers, and refuses seventeen (run %i)",
    async () => {
      await seed({ L: 3 })

      const results = await Promise.all(
        Array.from({ length: CONCURRENT }, () =>
          storePackage().execute(command("L"))
        )
      )

      const winners = results.filter(isOk).map((result) => result.value)
      const refused = results.filter(isErr).map((result) => result.error.code)

      expect(winners).toHaveLength(3)
      expect(refused).toHaveLength(CONCURRENT - 3)
      expect(new Set(refused)).toEqual(new Set(["NoSuitableLockerAvailable"]))

      expect(new Set(winners.map((won) => won.lockerLabel)).size).toBe(3)
      expect(new Set(winners.map((won) => won.pickupCode)).size).toBe(3)

      expect(await doubleBooked()).toEqual([])
      expect(await availability()).toEqual({ occupied: 3 })
    }
  )

  it("costs no capacity when there is exactly enough to go round", async () => {
    await seed({ L: 3 })

    const results = await Promise.all(
      Array.from({ length: 3 }, () => storePackage().execute(command("L")))
    )

    // `SKIP LOCKED` skips locked rows, never free ones — safety must not cost capacity.
    expect(results.filter(isOk)).toHaveLength(3)
    expect(await availability()).toEqual({ occupied: 3 })
  })

  it("still fills the smallest fitting lockers first, under load", async () => {
    await seed({ S: 2, M: 2, L: 2 })

    const results = await Promise.all(
      Array.from({ length: 3 }, () => storePackage().execute(command("S")))
    )

    const taken = results
      .filter(isOk)
      .map((result) => result.value.lockerLabel)
      .sort()

    // Smallest-fit ordering holds under load: both smalls, then the first medium.
    expect(taken).toEqual(["M1", "S1", "S2"])
    expect(await availability()).toEqual({ available: 3, occupied: 3 })
  })

  it("chooses the lockers the domain's own policy would have chosen", async () => {
    await seed({ S: 2, M: 2, L: 2 })

    const requirement = await smallPackage()
    const free = await new LockerRepository(db).findAvailableAtStation(
      network.stationId
    )

    // The fit rule exists twice — as SQL in the claim and as
    // `SmallestFitFirstService` in the domain — this asserts they have not drifted.
    let candidates = free
    const policyPicks: string[] = []
    for (let pick = 0; pick < 3; pick += 1) {
      const next = selection.select(candidates, requirement)
      if (isErr(next)) break

      policyPicks.push(next.value.label)
      candidates = candidates.filter((free) => free.id !== next.value.id)
    }

    const claimed: string[] = []
    for (let claim = 0; claim < 3; claim += 1) {
      const won = await new LockerRepository(db).claimSmallestFitting(
        network.stationId,
        requirement,
        { actingUserId: network.agentId }
      )
      if (won !== null) claimed.push(won.label)
    }

    expect(claimed).toEqual(policyPicks)
  })

  it("double-books when the claim is a read followed by a write", async () => {
    await seed({ L: 3 })

    const requirement = unwrap(
      PackageSize.create({ code: "L", rank: 3, label: "Large" })
    )
    const readingDone = barrier(CONCURRENT)

    // Barrier: every caller reads before any writes, so the double-book is
    // deterministic, not timing luck.
    const claimNaively = (): Promise<string | null> =>
      db.transaction(async (tx) => {
        const free = await new LockerRepository(tx).findAvailableAtStation(
          network.stationId
        )
        const chosen = selection.select(free, requirement)

        await readingDone()

        if (isErr(chosen)) return null

        await tx
          .update(locker)
          .set({ status: "occupied" })
          .where(eq(locker.id, chosen.value.id))

        return chosen.value.label
      })

    const claimed = (
      await Promise.all(
        Array.from({ length: CONCURRENT }, () =>
          claimNaively().catch(() => null)
        )
      )
    ).filter((label): label is string => label !== null)

    expect(claimed.length).toBeGreaterThan(3)
    expect(new Set(claimed).size).toBeLessThan(claimed.length)
  })

  it("holds the invariant where the naive claim broke it", async () => {
    await seed({ L: 3 })

    const requirement = unwrap(
      PackageSize.create({ code: "L", rank: 3, label: "Large" })
    )

    const claimed = (
      await Promise.all(
        Array.from({ length: CONCURRENT }, () =>
          db.transaction((tx) =>
            new LockerRepository(tx).claimSmallestFitting(
              network.stationId,
              requirement,
              { actingUserId: network.agentId }
            )
          )
        )
      )
    ).filter((won) => won !== null)

    // Same overlap, atomic claim: three winners, three distinct doors.
    expect(claimed).toHaveLength(3)
    expect(new Set(claimed.map((won) => won.label)).size).toBe(3)
  })
})

/**
 * The collection side: a pickup code opens a locker once. The row lock in
 * `findStoredByCodeHash` is what prevents a double-collection.
 */
describe("collecting a package under contention", () => {
  let network: Network

  const retrievePackage = () =>
    new RetrievePackageService({
      pricing: new PricingRepository(db),
      fees: new TieredDailyRateFeeService(),
      hasher,
      clock,
      uow: new UnitOfWork(db, ids),
    })

  const storeCommand = () => ({
    stationId: network.stationId,
    recipient: { name: "Ada Lovelace", email: "ada@fixture.test" },
    packageSizeCode: "L",
    audit: { actingUserId: network.agentId },
  })

  const seed = async () => {
    await pool.query("DELETE FROM fee_tier")
    await pool.query("DELETE FROM pricing_config")
    await clearNetwork(pool)
    network = await seedNetwork(pool, db, { L: 1 })

    await db
      .insert(pricingConfig)
      .values({ baseRatePerDay: "2.00", currencyCode: "AUD" })
    await db.insert(feeTier).values([
      { fromDay: 1, toDay: 5, multiplierHundredths: 100 },
      { fromDay: 6, toDay: 10, multiplierHundredths: 200 },
      { fromDay: 11, toDay: null, multiplierHundredths: 300 },
    ])
  }

  // Five runs: one pass shows only one interleaving.
  it.each([1, 2, 3, 4, 5])(
    "opens one door for twenty holders of one code (run %i)",
    async () => {
      await seed()

      const { pickupCode } = unwrap(
        await storePackage().execute(storeCommand())
      )

      const results = await Promise.all(
        Array.from({ length: CONCURRENT }, () =>
          retrievePackage().execute({
            pickupCode,
            audit: { actingUserId: null },
          })
        )
      )

      const winners = results.filter(isOk)
      const refused = results.filter(isErr).map((result) => result.error.code)

      // A lost race answers exactly like a wrong code — no leakage by design.
      expect(winners).toHaveLength(1)
      expect(refused).toHaveLength(CONCURRENT - 1)
      expect(new Set(refused)).toEqual(new Set(["InvalidPickupRequest"]))

      // Collected and invoiced exactly once.
      const { rows } = await pool.query(
        `SELECT status, fee_charged FROM package`
      )
      expect(rows).toEqual([{ status: "retrieved", fee_charged: "2.00" }])

      // Released and reusable: the station's only locker takes the next parcel.
      const next = await storePackage().execute(storeCommand())
      expect(isOk(next)).toBe(true)
    }
  )
})
