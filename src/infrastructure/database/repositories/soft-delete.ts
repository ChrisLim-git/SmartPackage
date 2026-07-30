import { isNull, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

/** Any table carrying the shared audit columns. */
type SoftDeletable = { deletedAt: PgColumn }

/**
 * The read filter every repository applies: a soft-deleted row is gone.
 *
 * It lives here rather than in each query so that no caller ever writes
 * `deleted_at IS NULL` — the day one is forgotten, deleted rows quietly come
 * back, and nothing fails to make that visible.
 *
 * Nothing soft-deletes yet. This ships now because the alternative is
 * remembering to add it later to queries that already work.
 */
export const notDeleted = (table: SoftDeletable): SQL => isNull(table.deletedAt)
