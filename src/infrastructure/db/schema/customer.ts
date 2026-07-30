import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import { user } from "./auth-schema"
import { auditColumns, primaryId } from "./columns"

/**
 * The recipient of a package.
 *
 * `user_id` is nullable and references the auth `user` with `on delete set
 * null`: deleting an account must not delete the person a package was
 * delivered to. That single column carries the domain's identity decision —
 * a customer exists whether or not anyone ever signs up.
 *
 * Singular table name and snake_case columns, like every table here.
 */
export const customer = pgTable(
  "customer",
  {
    id: primaryId(),
    name: text("name").notNull(),
    // Nullable, because a customer may be reachable by phone instead. The
    // domain entity enforces that at least one of the two is present.
    email: text("email"),
    phone: text("phone"),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...auditColumns,
  },
  (table) => [
    // On the raw column, not `lower(email)`, because `Customer` folds the
    // address before it can reach a repository — there is one form in the
    // database by construction. Its job is to stop `findOrCreateByEmail`
    // racing two rows for one person into existence.
    //
    // Deliberately *not* partial on `deleted_at`. Nothing soft-deletes a
    // customer, so the predicate would guard a state that cannot arise — and
    // it is not free: Postgres will not infer a partial index in `ON
    // CONFLICT`, so every upsert has to repeat the predicate or fail outright.
    // If customers ever do become soft-deletable, this index is the thing to
    // revisit, because two rows could then hold the same address.
    uniqueIndex("customer_email_unique").on(table.email),
  ]
)
