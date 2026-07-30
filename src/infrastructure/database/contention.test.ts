import { eq } from "drizzle-orm"

import { OrdinalFitService } from "@domain/services/ordinal-fit-service"
import { SmallestFitFirstService } from "@domain/services/smallest-fit-first-service"
import { StorePackageService } from "@domain/services/store-package-service"
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
import { LockerRepository } from "./repositories/locker-repository"
import { LockerSizeRepository } from "./repositories/locker-size-repository"
import { StationRepository } from "./repositories/station-repository"
import { UnitOfWork } from "./unit-of-work"

/**
 * The locker invariant under genuine parallelism: **at most one package occupies
 * a locker at any time.** This is the one test the whole concurrency design
 * exists for.
 *
 * Twenty requests through a pool of twenty, so twenty transactions really do
 * overlap — through the default pool of four this would be a test of four-way
 * contention and a queue. Isolation is by truncation rather than by wrapping each
 * case in a transaction, because a wrapping transaction would serialise the very
 * thing under test.
 *
 * Real Postgres, never PGlite. Measured against the same read-then-write claim:
 * real Postgres double-books, PGlite double-books nothing — its single WASM
 * backend serialises every transaction, so `SKIP LOCKED` never skips and a broken
 * claim passes. A suite that goes green against genuinely broken code is worse
 * than no suite.
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

  /** Any locker holding more than one stored parcel — the invariant, in SQL. */
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

  afterAll(async () => {
    await clearNetwork(pool)
    await pool.end()
  })

  // Five consecutive runs: a concurrency test that passes once has shown you one
  // interleaving, and the one that matters may be the second.
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
      // Every loser is told the ordinary thing rather than an error: from where
      // the agent is standing, losing a race is a station with nothing free.
      expect(new Set(refused)).toEqual(new Set(["NoSuitableLockerAvailable"]))

      // Three lockers, three winners, three different doors — and three different
      // codes, which the partial unique index is what actually guarantees.
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

    // `SKIP LOCKED` skips a *locked* row, never a free one. Three requests for
    // three lockers yielding two winners would mean the claim was trading
    // capacity for a safety it already has.
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

    // Both smalls and then the first medium, with both larges untouched: three
    // concurrent small packages do not scatter across the station.
    expect(taken).toEqual(["M1", "S1", "S2"])
    expect(await availability()).toEqual({ available: 3, occupied: 3 })
  })

  it("chooses the lockers the domain's own policy would have chosen", async () => {
    await seed({ S: 2, M: 2, L: 2 })

    const requirement = await smallPackage()
    const free = await new LockerRepository(db).findAvailableAtStation(
      network.stationId
    )

    // The claim writes the fit rule in SQL — `s.rank >= $1 ORDER BY s.rank, label`
    // — while the domain writes it as `SmallestFitFirstService`. Two expressions
    // of one rule can drift, and this is the assertion that they have not: the
    // SQL's three winners are the policy's first three picks.
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

    /**
     * The implementation `claimSmallestFitting` exists to replace: read the free
     * lockers, pick one, write to it.
     *
     * The barrier makes the failure a property of the *pattern* rather than of
     * timing luck — every caller finishes reading before any caller writes, which
     * is an interleaving real concurrency produces sometimes and this test needs
     * every time. Hoping for the race instead would give a case that passes on a
     * fast machine and fails in CI, and a flaky concurrency test teaches you to
     * ignore a red suite.
     */
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

    // The measurement that makes the atomic claim evidence rather than an
    // assertion about itself: the same station, the same requests, and the naive
    // pattern hands one locker to several agents. Each of those is a parcel
    // dropped into a door somebody else's parcel is already behind.
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

    // Same station, same twenty callers, same overlap. Three winners, three
    // distinct doors, and no caller waiting on a row it was going to lose.
    expect(claimed).toHaveLength(3)
    expect(new Set(claimed.map((won) => won.label)).size).toBe(3)
  })
})
