import { and, asc, eq } from "drizzle-orm"

import type { AuditContext } from "@domain/interfaces/audit-context"
import type { LockerRepository } from "@domain/interfaces/locker-repository"
import { Locker } from "@domain/entities/locker"
import { isErr } from "@domain/shared/result"
import { LockerSize, type PackageSize } from "@domain/utils/size"

import type { Db, DbOrTx } from "../client"
import { locker } from "../schema/locker"
import { lockerSize } from "../schema/locker-size"
import { notDeleted } from "./soft-delete"

type LockerRow = typeof locker.$inferSelect
type SizeRow = typeof lockerSize.$inferSelect

/**
 * `rehydrate`, not `create`: a locker read back from the database is whatever
 * it was left as, and forcing it through the creation path would hand every
 * occupied locker back empty.
 */
const toEntity = (row: { locker: LockerRow; locker_size: SizeRow }): Locker => {
  const size = LockerSize.create({
    code: row.locker_size.code,
    rank: row.locker_size.rank,
    label: row.locker_size.label,
  })

  if (isErr(size)) {
    throw new Error(
      `locker size ${row.locker_size.id} is unreadable: ${size.error.message}`
    )
  }

  const entity = Locker.rehydrate({
    id: row.locker.id,
    stationId: row.locker.stationId,
    size: size.value,
    label: row.locker.label,
    status: row.locker.status,
    // The locker table records *that* it is occupied; which package is in it
    // is the package table's business, and only the collection path asks.
    currentPackageId: null,
  })

  if (isErr(entity)) {
    throw new Error(
      `locker ${row.locker.id} cannot be read back from the database: ${entity.error.message}`
    )
  }

  return entity.value
}

export class PostgresLockerRepository implements LockerRepository {
  constructor(private readonly db: DbOrTx) {}

  /** Every read needs the size, so every read is the same join. */
  private selectLockers() {
    return (this.db as Db)
      .select()
      .from(locker)
      .innerJoin(lockerSize, eq(lockerSize.id, locker.sizeId))
  }

  async create(
    details: { stationId: string; sizeCode: string; label: string },
    actor: AuditContext
  ): Promise<Locker | null> {
    const [size] = await (this.db as Db)
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
    const [row] = await (this.db as Db)
      .insert(locker)
      .values({
        stationId: details.stationId,
        sizeId: size.id,
        label: details.label,
        createdBy: actor.actingUserId,
        updatedBy: actor.actingUserId,
      })
      .onConflictDoNothing({ target: [locker.stationId, locker.label] })
      .returning()

    return row === undefined
      ? null
      : toEntity({ locker: row, locker_size: size })
  }

  async findById(id: string): Promise<Locker | null> {
    const [row] = await this.selectLockers()
      .where(and(eq(locker.id, id), notDeleted(locker)))
      .limit(1)

    return row === undefined ? null : toEntity(row)
  }

  async findByLabel(stationId: string, label: string): Promise<Locker | null> {
    const [row] = await this.selectLockers()
      .where(
        and(
          eq(locker.stationId, stationId),
          eq(locker.label, label),
          notDeleted(locker)
        )
      )
      .limit(1)

    return row === undefined ? null : toEntity(row)
  }

  async findAvailableAtStation(stationId: string): Promise<Locker[]> {
    const rows = await this.selectLockers()
      .where(
        and(
          eq(locker.stationId, stationId),
          eq(locker.status, "available"),
          notDeleted(locker)
        )
      )
      // Smallest first, then by label — the same order the selection policy
      // would impose, so a caller reading this list sees the candidate it will
      // be given.
      .orderBy(asc(lockerSize.rank), asc(locker.label))

    return rows.map(toEntity)
  }

  async claimSmallestFitting(
    _stationId: string,
    _size: PackageSize,
    _actor: AuditContext
  ): Promise<Locker | null> {
    // Deliberately unimplemented until T501. A correct version needs
    // `FOR UPDATE SKIP LOCKED` inside a transaction; a version written from
    // `findAvailableAtStation` plus a write would pass every test in this
    // ticket and lose a locker the first time two agents stored at once.
    // Failing loudly is the honest placeholder — a silently wrong claim is the
    // exact bug this method exists to prevent.
    throw new Error("claimSmallestFitting arrives with the atomic claim (T501)")
  }

  async release(lockerId: string, actor: AuditContext): Promise<void> {
    await (this.db as Db)
      .update(locker)
      .set({ status: "available", updatedBy: actor.actingUserId })
      .where(eq(locker.id, lockerId))
  }

  async findAllWithAvailability(stationId?: string): Promise<Locker[]> {
    const rows = await this.selectLockers()
      .where(
        stationId === undefined
          ? notDeleted(locker)
          : and(eq(locker.stationId, stationId), notDeleted(locker))
      )
      .orderBy(asc(lockerSize.rank), asc(locker.label))

    return rows.map(toEntity)
  }
}
