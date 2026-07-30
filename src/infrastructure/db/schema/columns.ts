import { sql } from "drizzle-orm"
import { timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * The primary key every domain table uses: a UUIDv7, time-ordered so inserts
 * land at the end of the index instead of scattering across it.
 *
 * The `uuidv7()` default is Postgres 18's own function — no extension — and it
 * is a safety net, not the source. Ids are generated in the application through
 * the `IdGenerator` port so an entity is complete and assertable before it ever
 * reaches a repository.
 */
export const primaryId = () =>
  uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`)

/**
 * Spread into every domain table, so the convention cannot drift across seven
 * of them.
 *
 * **Five columns, not six.** There is deliberately no `deleted_by`: a soft
 * delete is a write, so `updated_by` already records who did it — `deleted_at`
 * is when, `updated_by` is who. The one cost is that if a soft-deleted row were
 * later restored or edited, `updated_by` would be overwritten and the original
 * deleter lost. No restore flow is in scope, so that trade is acceptable; it is
 * written down here so it stays deliberate rather than accidental.
 *
 * `created_by` and `updated_by` are nullable because seeds and system writes
 * genuinely have no acting user, and inventing a sentinel account to dodge a
 * null would be the worse design.
 *
 * BetterAuth's own tables are exempt — their schema is CLI-generated and
 * editing it invites drift on every regeneration.
 */
export const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    // Stamped by the ORM on every update, so no repository has to remember.
    .$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}
