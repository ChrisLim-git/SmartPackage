import { Locker } from "@domain/entities/locker"
import type { Package } from "@domain/entities/package"
import { Station } from "@domain/entities/station"
import { StorePackageService } from "@domain/services/store-package-service"
import { isErr, isOk } from "@domain/shared/result"
import { PickupCode } from "@domain/utils/pickup-code"
import { LockerSize } from "@domain/utils/size"

import { FixedClock } from "@/utils/clocks"
import { FakePickupCodeHasher } from "@/utils/fake-pickup-code-hasher"
import {
  InMemoryCustomerRepository,
  InMemoryLockerRepository,
  InMemoryLockerSizeRepository,
  InMemoryPackageRepository,
  InMemoryStationRepository,
  InMemoryUnitOfWork,
} from "@/utils/in-memory-repositories"
import { SequentialIdGenerator } from "@/utils/sequential-id-generator"
import { StubPickupCodeGenerator } from "@/utils/stub-pickup-code-generator"
import { unwrap } from "@/utils/unwrap"

/**
 * The whole of Level 1, exercised with no database and no HTTP.
 *
 * Every repository here is an in-memory fake holding real state, so these tests
 * run in microseconds and can enumerate cases a database test never would. What
 * they cannot prove is anything about SQL — the atomic claim and the transaction
 * are proven in infrastructure, against real Postgres.
 */

const STATION_ID = "019fb1ad-d64b-7fe4-bde0-9c4044892047"
const AGENT_ID = "019fb1ad-d64b-7fe4-bde0-9c40448920ff"
const STORED_AT = new Date("2026-03-01T09:00:00.000Z")

const small = unwrap(LockerSize.create({ code: "S", rank: 1, label: "Small" }))
const medium = unwrap(
  LockerSize.create({ code: "M", rank: 2, label: "Medium" })
)
const large = unwrap(LockerSize.create({ code: "L", rank: 3, label: "Large" }))

const station = unwrap(
  Station.create({
    id: STATION_ID,
    name: "Central Mall",
    address: "1 Mall Way",
  })
)

const free = (size: LockerSize, label: string): Locker =>
  unwrap(
    Locker.create({ id: `locker-${label}`, stationId: STATION_ID, size, label })
  )

/** An occupied locker, which only `rehydrate` can produce — a new locker is always free. */
const taken = (size: LockerSize, label: string): Locker =>
  unwrap(
    Locker.rehydrate({
      id: `locker-${label}`,
      stationId: STATION_ID,
      size,
      label,
      status: "occupied",
      currentPackageId: "some-other-package",
    })
  )

const hasher = new FakePickupCodeHasher()

const setup = (options: { lockers?: Locker[]; codes?: string[] } = {}) => {
  const sizes = [small, medium, large]
  // Held rather than queried: the fake replaces its own array on every claim, so
  // a reference to the initial one would not see a mutation — while the package
  // repository pushes into the array it was given, which is what "nothing was
  // persisted" needs to read.
  const stored: Package[] = []

  const lockers = new InMemoryLockerRepository(options.lockers ?? [], sizes)
  const packages = new InMemoryPackageRepository(stored)
  const customers = new InMemoryCustomerRepository(
    new SequentialIdGenerator("customer")
  )

  const service = new StorePackageService({
    stations: new InMemoryStationRepository([station]),
    lockerSizes: new InMemoryLockerSizeRepository(sizes),
    codes: new StubPickupCodeGenerator(options.codes ?? ["402913", "581274"]),
    hasher,
    ids: new SequentialIdGenerator("package"),
    clock: new FixedClock(STORED_AT),
    uow: new InMemoryUnitOfWork({ lockers, packages, customers }),
  })

  return { service, lockers, packages, customers, stored }
}

const command = (
  overrides: Partial<{ stationId: string; packageSizeCode: string }> = {}
) => ({
  stationId: STATION_ID,
  recipient: {
    name: "Ada Lovelace",
    email: "ada@example.test",
    phone: "+61400000000",
  },
  packageSizeCode: "S",
  audit: { actingUserId: AGENT_ID },
  ...overrides,
})

describe("storing a package", () => {
  it("puts a small package in a small locker when every size is free", async () => {
    const { service, lockers } = setup({
      lockers: [free(small, "S1"), free(medium, "M1"), free(large, "L1")],
    })

    const result = await service.execute(command())

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    expect(result.value.lockerLabel).toBe("S1")
    expect(result.value.pickupCode).toBe("402913")
    // From the injected clock. Ambient time would make a seven-day stay a
    // seven-day test.
    expect(result.value.storedAt).toEqual(STORED_AT)
    expect((await lockers.findById("locker-S1"))?.isAvailable()).toBe(false)
  })

  it("puts a small package in a medium locker when no small one is free", async () => {
    const { service } = setup({
      lockers: [taken(small, "S1"), free(medium, "M1"), free(large, "L1")],
    })

    const result = await service.execute(command())

    // Smallest *fitting*, not exact match: refusing the delivery while a
    // medium locker stands empty is the common misreading of the rule.
    expect(isOk(result) && result.value.lockerLabel).toBe("M1")
  })

  it("puts a small package in a large locker when only large ones are free", async () => {
    const { service } = setup({
      lockers: [taken(small, "S1"), taken(medium, "M1"), free(large, "L1")],
    })

    const result = await service.execute(command())

    expect(isOk(result) && result.value.lockerLabel).toBe("L1")
  })

  it("creates the recipient when their email is not known yet", async () => {
    const { service, customers, stored } = setup({
      lockers: [free(small, "S1")],
    })

    await service.execute(command())

    const recipient = await customers.findByEmail("ada@example.test")

    // An agent types a recipient's address at a locker wall; that person
    // becomes known without an account, an invitation or anything to resolve.
    expect(recipient?.name).toBe("Ada Lovelace")
    expect(stored[0].customerId).toBe(recipient?.id)
  })

  it("reuses a recipient already known by that email rather than duplicating them", async () => {
    const { service, customers, stored } = setup({
      lockers: [free(small, "S1"), free(small, "S2")],
    })

    const first = await customers.findOrCreateByEmail(
      { email: "ada@example.test", name: "Ada Lovelace" },
      { actingUserId: null }
    )
    await service.execute(command())

    expect(stored[0].customerId).toBe(first.id)
    expect(await customers.findById(first.id)).not.toBeNull()
  })

  it("stores only the hash of the code it hands back", async () => {
    const { service, stored } = setup({ lockers: [free(small, "S1")] })

    const result = await service.execute(command())

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    // The plaintext crosses the boundary exactly once, in the response. After
    // that only the hash exists — which is why the result type carries the code
    // and the entity does not.
    expect(stored[0].pickupCodeHash).toBe(
      hasher.hash(unwrap(PickupCode.create(result.value.pickupCode)))
    )
    expect(JSON.stringify(stored[0])).not.toContain(result.value.pickupCode)
  })

  it("gives two consecutive stores different lockers and different codes", async () => {
    const { service } = setup({
      lockers: [free(small, "S1"), free(small, "S2")],
      codes: ["402913", "581274"],
    })

    const first = await service.execute(command())
    const second = await service.execute(command())

    expect(isOk(first) && isOk(second)).toBe(true)
    if (!isOk(first) || !isOk(second)) return

    expect(first.value.lockerLabel).not.toBe(second.value.lockerLabel)
    expect(first.value.pickupCode).not.toBe(second.value.pickupCode)
  })

  it("takes another code when the one it generated is already in use", async () => {
    const { service } = setup({
      lockers: [free(small, "S1"), free(small, "S2")],
      // The generator hands out the same code twice before moving on, which is
      // what a collision looks like from in here.
      codes: ["402913", "402913", "581274"],
    })

    const first = await service.execute(command())
    const second = await service.execute(command())

    // A code is the entire credential on the collect screen, so two parcels
    // awaiting collection cannot share one — the second store retries rather
    // than failing the delivery or, worse, issuing a code that opens two doors.
    expect(isOk(first) && first.value.pickupCode).toBe("402913")
    expect(isOk(second) && second.value.pickupCode).toBe("581274")
  })

  it("refuses the store when nothing free fits, mutating nothing", async () => {
    const { service, lockers, stored } = setup({
      lockers: [taken(small, "S1"), taken(medium, "M1")],
    })

    const result = await service.execute(command())

    expect(isErr(result) && result.error.code).toBe("NoSuitableLockerAvailable")
    // The assertion that catches a half-applied store: a naive implementation
    // passes every other test in this file.
    expect(stored).toHaveLength(0)
    expect(await lockers.findAvailableAtStation(STATION_ID)).toHaveLength(0)
  })

  it("refuses a large package at a station holding only small and medium lockers", async () => {
    const { service } = setup({
      lockers: [free(small, "S1"), free(medium, "M1")],
    })

    const result = await service.execute(command({ packageSizeCode: "L" }))

    expect(isErr(result) && result.error.code).toBe("NoSuitableLockerAvailable")
  })

  it("refuses a store at a station that does not exist", async () => {
    const { service, stored } = setup({ lockers: [free(small, "S1")] })

    const result = await service.execute(
      command({ stationId: "019fb1ad-d64b-7fe4-bde0-000000000000" })
    )

    expect(isErr(result) && result.error.code).toBe("StationNotFound")
    expect(stored).toHaveLength(0)
  })

  it("refuses a package size that is not on the size ladder", async () => {
    const { service, stored } = setup({ lockers: [free(small, "S1")] })

    // The size codes are master data, so an unknown one is a malformed request
    // rather than a full station — and saying so is what keeps the route a
    // strip that guards, validates, delegates and maps.
    const result = await service.execute(command({ packageSizeCode: "XL" }))

    expect(isErr(result) && result.error.code).toBe("MalformedInput")
    expect(stored).toHaveLength(0)
  })
})
