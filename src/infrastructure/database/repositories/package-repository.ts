import { and, eq, sql } from "drizzle-orm"

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
 * Package persistence. Extends the plain base, not `EntityRepository`: every
 * read must join the size ladder.
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

    // `numeric` arrives as a string; converted only here, via
    // `fromDecimalString`, never `parseFloat`.
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
   * The parcel a code opens, found by the hash of that code and locked
   * `FOR UPDATE OF package` (the joined size row is master data, left unlocked).
   * A racing collection blocks on the lock; under READ COMMITTED the predicate
   * is re-evaluated after the winner commits, so the loser sees `retrieved`,
   * gets `null`, and answers like any other wrong code.
   */
  async findStoredByCodeHash(pickupCodeHash: string): Promise<Package | null> {
    const [row] = await this.selectPackages()
      .where(
        and(
          eq(packageTable.pickupCodeHash, pickupCodeHash),
          eq(packageTable.status, "stored"),
          this.visible
        )
      )
      .limit(1)
      .for("update", { of: packageTable })

    return row === undefined ? null : this.toEntity(row)
  }

  async save(parcel: Package, actor: AuditContext): Promise<boolean> {
    const [existing] = await this.query
      .select({ id: packageTable.id })
      .from(packageTable)
      // `visible` here too, or a soft-deleted row with this id would send the
      // store down the update branch and resurrect it.
      .where(and(eq(packageTable.id, parcel.id), this.visible))
      .limit(1)

    if (existing !== undefined) {
      // A collection: `stored_by` and the locker stay as audit trail.
      // Conditional on `stored` so a stale read cannot record a second
      // collection of a parcel that already left.
      const flipped = await this.query
        .update(packageTable)
        .set({
          status: parcel.status,
          retrievedAt: parcel.retrievedAt,
          feeCharged: parcel.feeCharged?.toDecimalString() ?? null,
          updatedBy: actor.actingUserId,
        })
        .where(
          and(
            eq(packageTable.id, parcel.id),
            eq(packageTable.status, "stored"),
            this.visible
          )
        )
        .returning({ id: packageTable.id })

      return flipped.length > 0
    }

    if (actor.actingUserId === null) {
      // `stored_by` is a domain fact, not an audit stamp: a parcel nobody
      // handed over cannot exist.
      throw new Error("a package cannot be stored without an agent")
    }

    const [size] = await this.query
      .select({ id: lockerSize.id })
      .from(lockerSize)
      .where(and(eq(lockerSize.code, parcel.size.code), notDeleted(lockerSize)))
      .limit(1)

    if (size === undefined) {
      // A bug, not caller input: the size came off this very ladder.
      throw new Error(`no locker size is coded "${parcel.size.code}"`)
    }

    // The partial unique index decides; an empty result is its verdict.
    const written = await this.query
      .insert(packageTable)
      .values({
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
      .onConflictDoNothing({
        target: packageTable.pickupCodeHash,
        // Postgres will not infer a partial index in ON CONFLICT — the
        // predicate must be repeated (`where` here, `targetWhere` on
        // onConflictDoUpdate).
        where: sql`status = 'stored' AND deleted_at IS NULL`,
      })
      .returning({ id: packageTable.id })

    return written.length > 0
  }
}
