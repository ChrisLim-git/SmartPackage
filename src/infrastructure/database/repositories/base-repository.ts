import { and, asc, eq, type SQL } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

import type { AuditContext } from "@domain/interfaces/audit-context"
import { isErr, type Result } from "@domain/shared/result"

import type { Db, DbOrTx } from "../client"
import { notDeleted } from "./soft-delete"

/** The two columns this base needs of a table; every domain table has both. */
export type AuditedTable = PgTable & {
  id: PgColumn
  deletedAt: PgColumn
}

/** What a repository writes on every row it inserts, so no method assembles it by hand. */
export type AuditStamp = {
  createdBy: string | null
  updatedBy: string | null
}

/**
 * The mechanics every repository here shares: one connection that may be a
 * transaction, the soft-delete filter, the actor stamp, and a single way to fail
 * when a row cannot be rebuilt.
 *
 * Written as a generic base rather than an interface each repository restates.
 * The five repositories had one `findById` between them repeated five times, and
 * each copy was another chance to forget `deleted_at IS NULL` — a mistake that
 * fails by quietly resurrecting deleted rows rather than by breaking.
 *
 * Nothing here declares `implements`. The shapes the domain needs live in
 * `@domain/interfaces/repository`, and TypeScript checks a repository against
 * them structurally where it is handed to a service or the `UnitOfWork` — the
 * only place a mismatch could do harm.
 */
export abstract class BaseRepository<TTable extends AuditedTable> {
  constructor(protected readonly db: DbOrTx) {}

  protected abstract readonly table: TTable

  /**
   * A transaction handle and the pool differ in type but not in the subset of
   * the query builder used here. The cast is in one place so no repository
   * method repeats it.
   */
  protected get query(): Db {
    return this.db as Db
  }

  /** The read filter every query gets: a soft-deleted row is gone. */
  protected get visible(): SQL {
    return notDeleted(this.table)
  }

  protected stamp(actor: AuditContext): AuditStamp {
    return { createdBy: actor.actingUserId, updatedBy: actor.actingUserId }
  }

  /**
   * Unwraps an entity rebuilt from a row, naming the row that cannot be read.
   *
   * A row read back is always one this codebase wrote, so an entity refusing to
   * rebuild is a bug here rather than bad input — hence a throw and not a
   * `Result` for the caller to handle.
   */
  protected rebuilt<T>(result: Result<T, { message: string }>, id: string): T {
    if (isErr(result)) {
      throw new Error(
        `row ${id} cannot be read back from the database: ${result.error.message}`
      )
    }

    return result.value
  }
}

/**
 * A repository whose entity maps to one row of one table, which is most of them:
 * `findById` and `findAll` are then the same query twice over, and only the row
 * mapping and the sort order differ.
 *
 * A collection whose reads need a join — `locker`, which is meaningless without
 * its size — extends `BaseRepository` directly and writes its own reads, rather
 * than inheriting two that cannot answer correctly.
 */
export abstract class EntityRepository<
  TEntity,
  TTable extends AuditedTable,
> extends BaseRepository<TTable> {
  protected abstract toEntity(row: TTable["$inferSelect"]): TEntity

  /**
   * How `findAll` sorts. Insertion order is meaningless to whoever reads the
   * list and changes when the seed does, so every listing states its order.
   */
  protected order(): (SQL | PgColumn)[] {
    return [asc(this.table.id)]
  }

  async findById(id: string): Promise<TEntity | null> {
    const [row] = await this.query
      .select()
      // Widened to the base table type: the generic parameter carries the row
      // shape, which the query builder cannot narrow for a table it only knows
      // abstractly. The row is cast back on the way out.
      .from(this.table as PgTable)
      .where(and(eq(this.table.id, id), this.visible))
      .limit(1)

    return row === undefined
      ? null
      : this.toEntity(row as TTable["$inferSelect"])
  }

  async findAll(): Promise<TEntity[]> {
    const rows = await this.query
      .select()
      .from(this.table as PgTable)
      .where(this.visible)
      .orderBy(...this.order())

    return rows.map((row) => this.toEntity(row as TTable["$inferSelect"]))
  }
}
