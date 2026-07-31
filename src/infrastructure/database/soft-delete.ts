import { isNull, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

/** Any table carrying the shared audit columns. */
type SoftDeletable = { deletedAt: PgColumn }

/**
 * The read filter every repository applies: a soft-deleted row is gone.
 * Centralised so no caller hand-writes `deleted_at IS NULL` — a forgotten
 * filter quietly resurrects deleted rows.
 */
export const notDeleted = (table: SoftDeletable): SQL => isNull(table.deletedAt)
