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
 * Extends the plain base rather than `EntityRepository`, because every read here
 * joins the size ladder: a locker without its size cannot answer what fits in
 * it, which is the only question the domain asks of one. Inheriting a
 * single-table `findById` would have meant a locker that reads back sizeless.
 */
export class LockerRepository extends BaseRepository<typeof locker> {
  protected readonly table = locker

  /** `rebuild`, not `create`: a locker read back is whatever it was left as. */
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
        // The locker table records *that* it is occupied; which package is in it
        // is the package table's business, and only the collection path asks.
        currentPackageId: null,
      }),
      row.locker.id
    )
  }

  /** Every read needs the size, so every read is the same join. */
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
      // A bug, not caller input: the route checks the code against the size
      // ladder before it gets here, so reaching this line means the ladder
      // changed underneath a request or a caller skipped the route.
      throw new Error(`no locker size is coded "${details.sizeCode}"`)
    }

    // `onConflictDoNothing` rather than catching a Postgres error code: the
    // unique index is the thing that decides, and reading its verdict from an
    // empty result keeps the driver's error taxonomy out of this class.
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
      // Smallest first, then by label — the same order the selection policy
      // would impose, so a caller reading this list sees the candidate it will
      // be given.
      .orderBy(asc(lockerSize.rank), asc(locker.label))

    return rows.map((row) => this.toEntity(row))
  }

  /**
   * One statement: pick the smallest free locker that fits and take it.
   *
   * The subquery holds a row lock — `FOR UPDATE OF l SKIP LOCKED` — so two agents
   * storing at the same station in the same moment do not both read the same free
   * locker and both write to it. `SKIP LOCKED` is what makes the loser take the
   * *next* locker instead of waiting for a row it is going to lose anyway, which
   * is why twenty concurrent stores against three lockers yield exactly three
   * packages and seventeen honest refusals rather than a deadlock.
   *
   * A read followed by a write cannot do this, whatever it is wrapped in: both
   * transactions see `available` at the same instant. That is why the interface
   * has one method with a business name rather than a `find` and a `save`.
   *
   * The fit rule is expressed as `size.rank >= required` here, and as
   * `OrdinalFitService` in the domain. That duplication is deliberate and it is
   * the price of atomicity — a claim that consulted the domain would be a read
   * and then a write again. `SmallestFitFirstService` orders candidates the same
   * way (`rank` then `label`), so the two agree on which locker; the in-memory
   * repository delegates to the real service precisely so a disagreement shows
   * up as a failing domain test rather than as a locker chosen differently in
   * production.
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

    // Nothing free fits, or every candidate is locked by another store in
    // flight. Both are ordinary outcomes, and neither is an error.
    return claimed === undefined ? null : this.findById(claimed.id)
  }

  async release(lockerId: string, actor: AuditContext): Promise<void> {
    await this.query
      .update(locker)
      .set({ status: "available", updatedBy: actor.actingUserId })
      .where(eq(locker.id, lockerId))
  }

  /**
   * Every locker with its current status — L1's availability listing.
   *
   * Occupied lockers included, unlike `findAvailableAtStation`: an operator
   * looking at a station needs to see it is full, not see an empty page.
   */
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
