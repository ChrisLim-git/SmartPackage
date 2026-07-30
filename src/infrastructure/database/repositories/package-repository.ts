import { and, desc, eq } from "drizzle-orm"

import { Package } from "@domain/entities/package"
import type { AuditContext } from "@domain/interfaces/audit-context"
import { Money } from "@domain/utils/money"
import { PackageSize } from "@domain/utils/size"

import { lockerSize } from "../schema/locker-size"
import { packageTable } from "../schema/package"
import { BaseRepository } from "./base-repository"
import { notDeleted } from "../soft-delete"

type PackageRow = typeof packageTable.$inferSelect
type SizeRow = typeof lockerSize.$inferSelect

/**
 * Extends the plain base rather than `EntityRepository`, because every read joins
 * the size ladder: the row stores a size id and the entity holds the size
 * itself, so a single-table read would hand back a parcel that cannot say what
 * it needed.
 */
export class PackageRepository extends BaseRepository<typeof packageTable> {
  protected readonly table = packageTable

  private toEntity(row: {
    package: PackageRow
    locker_size: SizeRow
  }): Package {
    const size = this.rebuilt(
      PackageSize.create({
        code: row.locker_size.code,
        rank: row.locker_size.rank,
        label: row.locker_size.label,
      }),
      row.locker_size.id
    )

    // `numeric` arrives as a string and becomes money here, through
    // `fromDecimalString` — never `parseFloat`. This is the only conversion, so
    // the money rule holds by construction rather than by everyone remembering.
    const feeCharged =
      row.package.feeCharged === null
        ? null
        : this.rebuilt(
            Money.fromDecimalString(row.package.feeCharged),
            row.package.id
          )

    return this.rebuilt(
      Package.rehydrate({
        id: row.package.id,
        customerId: row.package.customerId,
        size,
        lockerId: row.package.lockerId,
        pickupCodeHash: row.package.pickupCodeHash,
        status: row.package.status,
        storedAt: row.package.storedAt,
        retrievedAt: row.package.retrievedAt,
        feeCharged,
      }),
      row.package.id
    )
  }

  private selectPackages() {
    return this.query
      .select()
      .from(packageTable)
      .innerJoin(lockerSize, eq(lockerSize.id, packageTable.sizeId))
  }

  async findById(id: string): Promise<Package | null> {
    const [row] = await this.selectPackages()
      .where(and(eq(packageTable.id, id), this.visible))
      .limit(1)

    return row === undefined ? null : this.toEntity(row)
  }

  /**
   * The parcel currently in a locker, if there is one.
   *
   * Scoped to `stored`, which is what makes a replayed code indistinguishable
   * from a wrong one: a locker that has held ten parcels over a month holds one
   * now, and a collection asks about that one. Without the predicate a collected
   * parcel comes back and its code opens the door again.
   */
  async findStoredByLockerId(lockerId: string): Promise<Package | null> {
    const [row] = await this.selectPackages()
      .where(
        and(
          eq(packageTable.lockerId, lockerId),
          eq(packageTable.status, "stored"),
          this.visible
        )
      )
      .limit(1)

    return row === undefined ? null : this.toEntity(row)
  }

  async findByCustomerId(customerId: string): Promise<Package[]> {
    const rows = await this.selectPackages()
      .where(and(eq(packageTable.customerId, customerId), this.visible))
      // Most recent first: this list is read by the recipient, and the parcel
      // they are asking about is almost always the last one.
      .orderBy(desc(packageTable.storedAt))

    return rows.map((row) => this.toEntity(row))
  }

  async save(parcel: Package, actor: AuditContext): Promise<void> {
    const [existing] = await this.query
      .select({ id: packageTable.id })
      .from(packageTable)
      .where(eq(packageTable.id, parcel.id))
      .limit(1)

    if (existing !== undefined) {
      // A collection, not a store: `stored_by` and the locker stay as they were,
      // because which agent handed the parcel over and which locker held it are
      // the audit trail.
      await this.query
        .update(packageTable)
        .set({
          status: parcel.status,
          retrievedAt: parcel.retrievedAt,
          feeCharged: parcel.feeCharged?.toDecimalString() ?? null,
          updatedBy: actor.actingUserId,
        })
        .where(eq(packageTable.id, parcel.id))

      return
    }

    if (actor.actingUserId === null) {
      // `stored_by` is a domain fact rather than an audit stamp. A seed may write
      // a row with no actor; a parcel nobody handed over cannot exist, and
      // letting the null through would fail as a constraint violation naming a
      // column instead of saying this.
      throw new Error("a package cannot be stored without an agent")
    }

    const [size] = await this.query
      .select({ id: lockerSize.id })
      .from(lockerSize)
      .where(and(eq(lockerSize.code, parcel.size.code), notDeleted(lockerSize)))
      .limit(1)

    if (size === undefined) {
      // A bug rather than caller input: the size came off the ladder this
      // repository is now reading.
      throw new Error(`no locker size is coded "${parcel.size.code}"`)
    }

    await this.query.insert(packageTable).values({
      id: parcel.id,
      customerId: parcel.customerId,
      sizeId: size.id,
      lockerId: parcel.lockerId,
      pickupCodeHash: parcel.pickupCodeHash,
      status: parcel.status,
      storedAt: parcel.storedAt,
      retrievedAt: parcel.retrievedAt,
      feeCharged: parcel.feeCharged?.toDecimalString() ?? null,
      storedBy: actor.actingUserId,
      ...this.stamp(actor),
    })
  }
}
