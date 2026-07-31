import { sql } from "drizzle-orm"
import { timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * The primary key every domain table uses: a time-ordered UUIDv7. The
 * `uuidv7()` default (Postgres 18 built-in) is a safety net — ids are normally
 * generated in the application via `IdGenerator`.
 */
export const primaryId = () =>
  uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`)

/**
 * Audit columns spread into every domain table (BetterAuth's tables exempt).
 * No `deleted_by`: a soft delete is a write, so `updated_by` records who and
 * `deleted_at` when. Actor columns are nullable (seeds have no acting user)
 * and deliberately have no foreign key to `user` — an audit stamp must not
 * block a deletion or rewrite history. They are `uuid`, which holds only
 * because BetterAuth is configured to issue uuid v7 ids.
 */
export const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    // Stamped by Postgres, not `new Date()`: mixing the microsecond database
    // clock with a millisecond-truncated JS Date can put updated_at before
    // created_at on a fast insert-then-update.
    .$onUpdate(() => sql`now()`),
  updatedBy: uuid("updated_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}
