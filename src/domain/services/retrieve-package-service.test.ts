import { Locker } from "@domain/entities/locker"
import type { Package } from "@domain/entities/package"
import { Station } from "@domain/entities/station"
import type { AuditContext } from "@domain/interfaces/audit-context"
import { RetrievePackageService } from "@domain/services/retrieve-package-service"
import { StorePackageService } from "@domain/services/store-package-service"
import { TieredDailyRateFeeService } from "@domain/services/tiered-daily-rate-fee-service"
import { isErr, isOk } from "@domain/shared/result"
import { FeeTier } from "@domain/utils/fee-tier"
import { Money } from "@domain/utils/money"
import { PricingConfig } from "@domain/utils/pricing-config"
import { LockerSize } from "@domain/utils/size"

import { AdvanceableClock } from "@/test/doubles/clocks"
import { FakePickupCodeHasher } from "@/test/doubles/fake-pickup-code-hasher"
import {
  InMemoryCustomerRepository,
  InMemoryLockerRepository,
  InMemoryLockerSizeRepository,
  InMemoryPackageRepository,
  InMemoryPricingRepository,
  InMemoryStationRepository,
  InMemoryUnitOfWork,
} from "@/test/doubles/in-memory-repositories"
import { SequentialIdGenerator } from "@/test/doubles/sequential-id-generator"
import { StubPickupCodeGenerator } from "@/test/doubles/stub-pickup-code-generator"
import { unwrap } from "@/test/support/unwrap"

/**
 * Levels 2 and 3 together: a collection is validated, priced and completed, or
 * none of those things happen.
 *
 * Packages are put into lockers through `StorePackageService` rather than
 * assembled by hand. A hand-built fixture can describe a state the store flow
 * cannot actually produce, and a retrieval test that starts from an impossible
 * state proves nothing about a real collection.
 */

const STATION_ID = "019fb1ad-d64b-7fe4-bde0-9c4044892047"
const OTHER_STATION_ID = "019fb1ad-d64b-7fe4-bde0-9c4044892048"
const AGENT_ID = "019fb1ad-d64b-7fe4-bde0-9c40448920ff"
const STORED_AT = new Date("2026-03-01T09:00:00.000Z")
const AUDIT: AuditContext = { actingUserId: AGENT_ID }

const FIRST_CODE = "402913"
const SECOND_CODE = "581274"

const small = unwrap(LockerSize.create({ code: "S", rank: 1, label: "Small" }))
const medium = unwrap(
  LockerSize.create({ code: "M", rank: 2, label: "Medium" })
)

const stations = [
  unwrap(
    Station.create({ id: STATION_ID, name: "Central Mall", address: "1 Mall" })
  ),
  unwrap(
    Station.create({ id: OTHER_STATION_ID, name: "Airport", address: "2 Air" })
  ),
]

const free = (
  size: LockerSize,
  label: string,
  stationId: string = STATION_ID
): Locker =>
  unwrap(
    Locker.create({
      id: `locker-${label}-${stationId}`,
      stationId,
      size,
      label,
    })
  )

/** The specification's own worked example: 2.00 a day, doubling then tripling. */
const PRICING = unwrap(
  PricingConfig.create({
    baseRate: unwrap(Money.fromDecimalString("2.00")),
    tiers: [
      unwrap(FeeTier.create({ fromDay: 1, toDay: 5, multiplier: 1 })),
      unwrap(FeeTier.create({ fromDay: 6, toDay: 10, multiplier: 2 })),
      unwrap(FeeTier.create({ fromDay: 11, toDay: null, multiplier: 3 })),
    ],
  })
)

const hasher = new FakePickupCodeHasher()

/**
 * A locker repository whose release fails after the package has been read.
 *
 * The one corruption worth a dedicated fixture: a package marked collected
 * while its locker stays occupied leaves the locker dead forever and the parcel
 * gone from the system.
 */
class UnreleasableLockerRepository extends InMemoryLockerRepository {
  async release(): Promise<void> {
    throw new Error("the locker row could not be written")
  }
}

const setup = (
  options: {
    lockers?: Locker[]
    lockerRepository?: (lockers: Locker[]) => InMemoryLockerRepository
  } = {}
) => {
  const sizes = [small, medium]
  const stored: Package[] = []
  const clock = new AdvanceableClock(STORED_AT)

  const held = options.lockers ?? [free(small, "S1"), free(small, "S2")]
  const lockers = (
    options.lockerRepository ?? ((l) => new InMemoryLockerRepository(l, sizes))
  )(held)
  const packages = new InMemoryPackageRepository(stored)
  const customers = new InMemoryCustomerRepository(
    new SequentialIdGenerator("customer")
  )
  const uow = new InMemoryUnitOfWork({ lockers, packages, customers })

  const store = new StorePackageService({
    stations: new InMemoryStationRepository(stations),
    lockerSizes: new InMemoryLockerSizeRepository(sizes),
    codes: new StubPickupCodeGenerator([FIRST_CODE, SECOND_CODE]),
    hasher,
    ids: new SequentialIdGenerator("package"),
    clock,
    uow,
  })

  const retrieve = new RetrievePackageService({
    pricing: new InMemoryPricingRepository(PRICING),
    fees: new TieredDailyRateFeeService(),
    hasher,
    clock,
    uow,
  })

  return { store, retrieve, lockers, packages, stored, clock }
}

const storeOne = async (
  store: StorePackageService,
  stationId: string = STATION_ID
) =>
  unwrap(
    await store.execute({
      stationId,
      recipient: { name: "Ada Lovelace", email: "ada@example.test" },
      packageSizeCode: "S",
      audit: AUDIT,
    })
  )

const collection = (
  overrides: Partial<{
    stationId: string
    lockerLabel: string
    pickupCode: string
  }> = {}
) => ({
  stationId: STATION_ID,
  lockerLabel: "S1",
  pickupCode: FIRST_CODE,
  audit: AUDIT,
  ...overrides,
})

describe("collecting a package", () => {
  it("frees the locker, marks the package collected and returns the fee", async () => {
    const { store, retrieve, lockers, stored, clock } = setup()

    const { lockerLabel, pickupCode } = await storeOne(store)
    clock.advanceBy("2d")

    const result = await retrieve.execute(
      collection({ lockerLabel, pickupCode })
    )

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    expect(result.value.fee.toDecimalString()).toBe("4.00")
    expect(result.value.retrievedAt).toEqual(
      new Date(STORED_AT.getTime() + 2 * 24 * 60 * 60 * 1_000)
    )
    expect(result.value.packageId).toBe(stored[0].id)
    expect(stored[0].status).toBe("retrieved")
    expect((await lockers.findByLabel(STATION_ID, "S1"))?.isAvailable()).toBe(
      true
    )
  })

  it("leaves the locker usable for the next delivery straight away", async () => {
    const { store, retrieve } = setup({ lockers: [free(small, "S1")] })

    const first = await storeOne(store)
    await retrieve.execute(
      collection({
        lockerLabel: first.lockerLabel,
        pickupCode: first.pickupCode,
      })
    )

    // L2's "available again for future deliveries", asserted the only way that
    // means anything: the station had exactly one locker, so a second store
    // succeeding proves the first one was really given back.
    const second = await storeOne(store)

    expect(second.lockerLabel).toBe("S1")
  })

  it("charges the fee the package was priced at, not just the one it reported", async () => {
    const { store, retrieve, stored, clock } = setup()

    const { lockerLabel, pickupCode } = await storeOne(store)
    clock.advanceBy("7d")

    const result = await retrieve.execute(
      collection({ lockerLabel, pickupCode })
    )

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    // Persisted, not only returned: the fee is what the operator invoiced, and
    // a response is not a record.
    expect(stored[0].feeCharged?.toDecimalString()).toBe(
      result.value.fee.toDecimalString()
    )
  })

  describe("the fee, priced in bands", () => {
    it.each([
      ["a collection the same day", "1h", "2.00"],
      ["five days", "5d", "10.00"],
      ["seven days", "7d", "18.00"],
      ["eleven days", "11d", "36.00"],
    ])("charges %s as %s", async (_label, stay, expected) => {
      const { store, retrieve, clock } = setup()

      const { lockerLabel, pickupCode } = await storeOne(store)
      clock.advanceBy(stay)

      const result = await retrieve.execute(
        collection({ lockerLabel, pickupCode })
      )

      // Seven days is nine times base, not fourteen: five days at the first
      // band's rate plus two at the second's. Inlining "days times rate" in the
      // handler is the trap this asserts against.
      expect(isOk(result) && result.value.fee.toDecimalString()).toBe(expected)
    })
  })

  describe("rejected collections", () => {
    it("refuses a locker label that does not exist at the station", async () => {
      const { store, retrieve } = setup()

      await storeOne(store)
      const result = await retrieve.execute(collection({ lockerLabel: "S9" }))

      expect(isErr(result) && result.error.code).toBe("InvalidPickupRequest")
    })

    it("refuses a label that exists only at another station", async () => {
      const { store, retrieve } = setup({
        lockers: [free(small, "S1"), free(small, "A1", OTHER_STATION_ID)],
      })

      await storeOne(store, OTHER_STATION_ID)

      // A label is only unique where the person is standing. Resolving it
      // across the network would open a locker at the wrong site.
      const result = await retrieve.execute(collection({ lockerLabel: "A1" }))

      expect(isErr(result) && result.error.code).toBe("InvalidPickupRequest")
    })

    it("refuses the right locker with the wrong code", async () => {
      const { store, retrieve, stored, lockers } = setup()

      const { lockerLabel } = await storeOne(store)
      const result = await retrieve.execute(
        collection({ lockerLabel, pickupCode: "999999" })
      )

      expect(isErr(result) && result.error.code).toBe("InvalidPickupRequest")
      expect(stored[0].status).toBe("stored")
      expect((await lockers.findByLabel(STATION_ID, "S1"))?.isAvailable()).toBe(
        false
      )
    })

    it("refuses a real code presented at the wrong locker", async () => {
      const { store, retrieve } = setup()

      const first = await storeOne(store)
      const second = await storeOne(store)

      const result = await retrieve.execute(
        collection({
          lockerLabel: second.lockerLabel,
          pickupCode: first.pickupCode,
        })
      )

      expect(isErr(result) && result.error.code).toBe("InvalidPickupRequest")
    })

    it("refuses a code presented at an empty locker", async () => {
      const { store, retrieve } = setup()

      const { pickupCode } = await storeOne(store)
      const result = await retrieve.execute(
        collection({ lockerLabel: "S2", pickupCode })
      )

      expect(isErr(result) && result.error.code).toBe("InvalidPickupRequest")
    })

    it("refuses a code that has already been used to collect", async () => {
      const { store, retrieve } = setup()

      const { lockerLabel, pickupCode } = await storeOne(store)
      await retrieve.execute(collection({ lockerLabel, pickupCode }))

      const replay = await retrieve.execute(
        collection({ lockerLabel, pickupCode })
      )

      expect(isErr(replay) && replay.error.code).toBe("InvalidPickupRequest")
    })

    it.each(["abc", "12345", "1234567", "", "40291 "])(
      "refuses %p as a pickup code before looking anything up",
      async (code) => {
        const { store, retrieve } = setup()

        const { lockerLabel } = await storeOne(store)
        const result = await retrieve.execute(
          collection({ lockerLabel, pickupCode: code })
        )

        // Malformed rather than invalid: the shape is wrong, which is a
        // correctable mistake and reveals nothing about which lockers are real.
        expect(isErr(result) && result.error.code).toBe("MalformedInput")
      }
    )

    it("answers every rejected collection identically", async () => {
      const { store, retrieve } = setup()

      const first = await storeOne(store)
      await storeOne(store)

      const attempts = [
        collection({ lockerLabel: "S9" }),
        collection({ lockerLabel: first.lockerLabel, pickupCode: "999999" }),
        collection({ lockerLabel: "S2", pickupCode: first.pickupCode }),
      ]

      const answers = []
      for (const attempt of attempts) {
        answers.push(await retrieve.execute(attempt))
      }

      // Byte-identical, not merely the same code. Any difference — a locker id
      // in a message, a distinct error — hands an attacker a map of which
      // labels are real and which hold a package.
      const [reference] = answers.map((answer) => JSON.stringify(answer))
      expect(answers.map((answer) => JSON.stringify(answer))).toEqual(
        answers.map(() => reference)
      )
    })
  })

  it("does not mark a package collected when its locker cannot be freed", async () => {
    const { store, retrieve, stored, lockers } = setup({
      lockers: [free(small, "S1")],
      lockerRepository: (held) =>
        new UnreleasableLockerRepository(held, [small]),
    })

    const { lockerLabel, pickupCode } = await storeOne(store)

    await expect(
      retrieve.execute(collection({ lockerLabel, pickupCode }))
    ).rejects.toThrow("the locker row could not be written")

    // The write that fails takes the whole collection with it. A package
    // recorded as collected behind an occupied locker is the worst state this
    // system can reach: the locker is dead and the parcel is gone.
    expect(stored[0].status).toBe("stored")
    expect((await lockers.findByLabel(STATION_ID, "S1"))?.isAvailable()).toBe(
      false
    )
  })
})
