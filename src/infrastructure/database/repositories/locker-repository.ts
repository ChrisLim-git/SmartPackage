import { and, asc, eq, sql } from "drizzle-orm"

import { Locker } from "@domain/entities/locker"
import type { AuditContext } from "@domain/interfaces/audit-context"
import { LockerSize, type PackageSize } from "@domain/utils/size"

import { locker } from "../schema/locker"
import { lockerSize } from "../schema/locker-size"
import { BaseRepository } from "./base-repository"
import { notDeleted } from "../soft-delete"

type LockerRow = typeof locker.$inferSelect
type SizeRow = typeof lockerSize.$inferSelect

/**
 * Locker persistence. Extends the plain base, not `EntityRepository`: every
 * read must join the size ladder, so single-table reads would be wrong.
 */
export class LockerRepository extends BaseRepository<typeof locker> {
  protected readonly table = locker

  private toEntity(row: { locker: LockerRow; locker_size: SizeRow }): Locker {
    const size = this.rebuilt(
      LockerSize.create({
        code: row.locker_size.code,
        rank: row.locker_size.rank,
        label: row.locker_size.label,
      }),
      row.locker_size.id
    )

    return this.rebuilt(
      Locker.rehydrate({
        id: row.locker.id,
        stationId: row.locker.stationId,
        size,
        label: row.locker.label,
        status: row.locker.status,
        // Which package occupies it is the package table's business.
        currentPackageId: null,
      }),
      row.locker.id
    )
  }

  private selectLockers() {
    return this.query
      .select()
      .from(locker)
      .innerJoin(lockerSize, eq(lockerSize.id, locker.sizeId))
  }

  async create(
    details: { stationId: string; sizeCode: string; label: string },
    actor: AuditContext
  ): Promise<Locker | null> {
    const [size] = await this.query
      .select()
      .from(lockerSize)
      .where(and(eq(lockerSize.code, details.sizeCode), notDeleted(lockerSize)))
      .limit(1)

    if (size === undefined) {
      // A bug, not caller input: the route validates the code before this.
      throw new Error(`no locker size is coded "${details.sizeCode}"`)
    }

    // The unique index decides; an empty result is its verdict.
    const [row] = await this.query
      .insert(locker)
      .values({
        stationId: details.stationId,
        sizeId: size.id,
        label: details.label,
        ...this.stamp(actor),
      })
      .onConflictDoNothing({ target: [locker.stationId, locker.label] })
      .returning()

    return row === undefined
      ? null
      : this.toEntity({ locker: row, locker_size: size })
  }

  async findById(id: string): Promise<Locker | null> {
    const [row] = await this.selectLockers()
      .where(and(eq(locker.id, id), this.visible))
      .limit(1)

    return row === undefined ? null : this.toEntity(row)
  }

  async findAll(): Promise<Locker[]> {
    return this.findAllWithAvailability()
  }

  async findByLabel(stationId: string, label: string): Promise<Locker | null> {
    const [row] = await this.selectLockers()
      .where(
        and(
          eq(locker.stationId, stationId),
          eq(locker.label, label),
          this.visible
        )
      )
      .limit(1)

    return row === undefined ? null : this.toEntity(row)
  }

  async findAvailableAtStation(stationId: string): Promise<Locker[]> {
    const rows = await this.selectLockers()
      .where(
        and(
          eq(locker.stationId, stationId),
          eq(locker.status, "available"),
          this.visible
        )
      )
      // Smallest first, then by label — the selection policy's order.
      .orderBy(asc(lockerSize.rank), asc(locker.label))

    return rows.map((row) => this.toEntity(row))
  }

  /**
   * Pick the smallest free fitting locker and take it, in one statement — a
   * separate read and write would let two transactions see the same `available`
   * row. `FOR UPDATE OF l SKIP LOCKED` makes a loser take the *next* locker
   * instead of waiting on a row it will lose. The fit rule is duplicated here
   * from the domain (`OrdinalFitService`) as the price of atomicity; a domain
   * test asserts the two agree.
   */
  async claimSmallestFitting(
    stationId: string,
    size: PackageSize,
    actor: AuditContext
  ): Promise<Locker | null> {
    const claim = await this.query.execute<{ id: string }>(sql`
      UPDATE ${locker}
         SET status = 'occupied',
             updated_by = ${actor.actingUserId},
             updated_at = now()
       WHERE id = (
             SELECT l.id
               FROM ${locker} l
               JOIN ${lockerSize} s ON s.id = l.size_id
              WHERE l.station_id = ${stationId}
                AND l.status = 'available'
                AND l.deleted_at IS NULL
                AND s.deleted_at IS NULL
                AND s.rank >= ${size.rank}
              ORDER BY s.rank ASC, l.label ASC
                FOR UPDATE OF l SKIP LOCKED
              LIMIT 1
       )
      RETURNING id
    `)

    const claimed = claim.rows[0]

    // Nothing free fits, or every candidate is locked — ordinary outcomes.
    return claimed === undefined ? null : this.findById(claimed.id)
  }

  async release(lockerId: string, actor: AuditContext): Promise<void> {
    await this.query
      .update(locker)
      .set({ status: "available", updatedBy: actor.actingUserId })
      // Writes must skip soft-deleted rows too, or a decommissioned locker
      // comes back advertised as available.
      .where(and(eq(locker.id, lockerId), this.visible))
  }

  /** Every locker with its current status, occupied ones included. */
  async findAllWithAvailability(stationId?: string): Promise<Locker[]> {
    const rows = await this.selectLockers()
      .where(
        stationId === undefined
          ? this.visible
          : and(eq(locker.stationId, stationId), this.visible)
      )
      .orderBy(asc(lockerSize.rank), asc(locker.label))

    return rows.map((row) => this.toEntity(row))
  }
}
