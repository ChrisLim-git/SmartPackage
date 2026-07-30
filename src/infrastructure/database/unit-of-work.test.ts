import { Package } from "@domain/entities/package"
import { Money } from "@domain/utils/money"
import { PickupCode } from "@domain/utils/pickup-code"
import { PackageSize } from "@domain/utils/size"

import { FixedClock } from "@/utils/clocks"
import { FakePickupCodeHasher } from "@/utils/fake-pickup-code-hasher"
import {
  clearNetwork,
  type Network,
  seedNetwork,
} from "@/utils/network-fixture"
import { createTestDb } from "@/utils/test-db"
import { unwrap } from "@/utils/unwrap"

import { UuidV7Generator } from "../generators/uuid-v7-generator"
import { PackageRepository } from "./repositories/package-repository"
import { UnitOfWork } from "./unit-of-work"

const { pool, db } = createTestDb()

const ids = new UuidV7Generator()
const hasher = new FakePickupCodeHasher()
const STORED_AT = new Date("2026-03-01T09:00:00.000Z")
const RETRIEVED_AT = new Date("2026-03-03T09:00:00.000Z")

/**
 * The only place transaction semantics are proved rather than assumed.
 *
 * Collecting a parcel marks it retrieved *and* frees its locker. Half of that is
 * either a locker holding a parcel nobody can collect again, or a locker
 * advertised as free with a parcel still inside — so the interesting assertions
 * here are all about what is in the database after a failure.
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
        code: unwrap(PickupCode.create("402913")),
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

    // The fee as the column holds it: `numeric`, not a float. 4.00 arriving as
    // 3.9999999 is the bug the money rule exists to prevent, and this is the
    // boundary it would cross.
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

    // Not "the last write was undone" — neither was. A parcel marked collected
    // behind an occupied locker is unreachable forever, and the reverse
    // advertises a locker with a stranger's parcel in it.
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

      // Read through a repository bound to the same transaction: it must see the
      // uncommitted release. A repository holding the pool instead would read
      // around the transaction and still say "occupied", which is how a service
      // ends up deciding on stale state.
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

        // A nested `run` would check out a *second* connection from the pool and
        // open an unrelated transaction on it — invisible to the first, unable to
        // see its uncommitted release, and blocking on any row it holds. No flow
        // here nests, so this fails loudly instead of pretending to be a
        // savepoint.
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
