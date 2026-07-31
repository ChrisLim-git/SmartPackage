import { and, asc, eq, type SQL } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

import type { AuditContext } from "@domain/interfaces/audit-context"
import { isErr, type Result } from "@domain/shared/result"

import type { Db, DbOrTx } from "../client"
import { notDeleted } from "../soft-delete"

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
 * Shared repository mechanics: a connection that may be a transaction, the
 * soft-delete filter, the actor stamp, and one way to fail a rebuild.
 * No `implements` — the domain interfaces are checked structurally where a
 * repository is handed to a service or the `UnitOfWork`.
 */
export abstract class BaseRepository<TTable extends AuditedTable> {
  constructor(protected readonly db: DbOrTx) {}

  protected abstract readonly table: TTable

  /** Pool and transaction handle differ in type, not in the builder subset used here. */
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
   * Unwraps an entity rebuilt from a row. A row that cannot be read back is a
   * bug, not bad input — hence a throw, not a `Result`.
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
 * A repository whose entity maps to one row of one table. Repositories whose
 * reads need a join extend `BaseRepository` directly instead.
 */
export abstract class EntityRepository<
  TEntity,
  TTable extends AuditedTable,
> extends BaseRepository<TTable> {
  protected abstract toEntity(row: TTable["$inferSelect"]): TEntity

  /** How `findAll` sorts — every listing states its order. */
  protected order(): (SQL | PgColumn)[] {
    return [asc(this.table.id)]
  }

  async findById(id: string): Promise<TEntity | null> {
    const [row] = await this.query
      .select()
      // Widened: the builder cannot narrow an abstract table type; the row is
      // cast back on the way out.
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
