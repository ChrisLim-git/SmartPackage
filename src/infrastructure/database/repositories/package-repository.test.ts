import { Package } from "@domain/entities/package"
import { SYSTEM_ACTOR } from "@domain/interfaces/audit-context"
import { Money } from "@domain/utils/money"
import { PickupCode } from "@domain/utils/pickup-code"
import { PackageSize } from "@domain/utils/size"

import { FixedClock } from "@/test/doubles/clocks"
import { FakePickupCodeHasher } from "@/test/doubles/fake-pickup-code-hasher"
import {
  clearNetwork,
  type Network,
  seedNetwork,
} from "@/test/support/network-fixture"
import { createTestDb } from "@/test/support/test-db"
import { unwrap } from "@/test/support/unwrap"

import { UuidV7Generator } from "../../generators/uuid-v7-generator"
import { PackageRepository } from "./package-repository"

const { pool, db } = createTestDb()

const ids = new UuidV7Generator()
const hasher = new FakePickupCodeHasher()
const STORED_AT = new Date("2026-03-01T09:00:00.000Z")

/**
 * Only what a generic repository would not already do.
 *
 * There is no test that a saved row reads back — that proves the ORM works.
 * What is here is the money mapping, which is the one place a float could enter
 * the system, and the `stored` predicate, which decides whether a locker with a
 * month of history hands back the parcel that is in it now.
 */
describe("PackageRepository", () => {
  let network: Network

  beforeEach(async () => {
    await clearNetwork(pool)
    network = await seedNetwork(pool, db)
  })

  afterAll(async () => {
    await clearNetwork(pool)
    await pool.end()
  })

  const repository = () => new PackageRepository(db)

  const stored = (lockerLabel: string, code = "402913") => {
    const size = unwrap(
      PackageSize.create({ code: "S", rank: 1, label: "Small" })
    )

    return unwrap(
      Package.store({
        id: ids.next(),
        customerId: network.customerId,
        size,
        lockerId: network.lockerIds[lockerLabel],
        code: unwrap(PickupCode.create(code)),
        hasher,
        clock: new FixedClock(STORED_AT),
      })
    )
  }

  it("reads a fee back as the exact amount charged, never a float", async () => {
    const packages = repository()
    const parcel = stored("S1")

    await packages.save(parcel, { actingUserId: network.agentId })
    await packages.save(
      unwrap(
        parcel.retrieve(
          new Date("2026-03-08T09:00:00.000Z"),
          unwrap(Money.fromDecimalString("18.00"))
        )
      ),
      SYSTEM_ACTOR
    )

    const [collected] = await packages.findByCustomerId(network.customerId)

    // Drizzle hands `numeric` back as a string and this is the only place it
    // becomes money. 18.00 through a float is 1799 minor units on the wrong day.
    expect(collected.feeCharged?.toMinorUnits()).toBe(1800)
    expect(collected.feeCharged?.toDecimalString()).toBe("18.00")
  })

  it("keeps the storage instant to the millisecond, with its zone", async () => {
    const packages = repository()

    await packages.save(stored("S1"), { actingUserId: network.agentId })
    const [parcel] = await packages.findByCustomerId(network.customerId)

    // A `timestamptz` column and a `Date`: a stay is priced off this instant, so
    // an hour of drift is a day of fee at the wrong tier boundary.
    expect(parcel.storedAt.toISOString()).toBe(STORED_AT.toISOString())
  })

  it("hands back the parcel in the locker now, not the ones that were", async () => {
    const packages = repository()
    const first = stored("S1", "402913")

    await packages.save(first, { actingUserId: network.agentId })
    await packages.save(
      unwrap(
        first.retrieve(
          new Date("2026-03-02T09:00:00.000Z"),
          unwrap(Money.fromDecimalString("4.00"))
        )
      ),
      SYSTEM_ACTOR
    )

    const second = stored("S1", "581274")
    await packages.save(second, { actingUserId: network.agentId })

    const current = await packages.findStoredByLockerId(network.lockerIds["S1"])

    // The whole reason the query is scoped to `stored`: a locker that has held
    // ten parcels over a month holds one now, and a collection asks about that
    // one. Without the predicate, the first — already collected — comes back and
    // its code opens the door again.
    expect(current?.id).toBe(second.id)
  })

  it("refuses to record a parcel with no agent answerable for it", async () => {
    const packages = repository()

    // `stored_by` is a domain fact, not an audit stamp: a seed may write a row
    // with no actor, but a package nobody handed over cannot exist.
    await expect(packages.save(stored("S1"), SYSTEM_ACTOR)).rejects.toThrow(
      /agent/
    )
  })
})
