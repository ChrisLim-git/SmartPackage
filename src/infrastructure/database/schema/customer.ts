import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { user } from "./auth-schema"
import { auditColumns, primaryId } from "./columns"

/**
 * The recipient of a package. `user_id` is nullable with `on delete set null`:
 * a customer exists whether or not anyone ever signs up.
 */
export const customer = pgTable(
  "customer",
  {
    id: primaryId(),
    name: text("name").notNull(),
    // Nullable; the entity enforces at least one of email/phone.
    email: text("email"),
    phone: text("phone"),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...auditColumns,
  },
  (table) => [
    // Raw column, not lower(email): `Customer` folds the address first. Not
    // partial on deleted_at — nothing soft-deletes a customer, and a partial
    // index would force every upsert to repeat the predicate in ON CONFLICT.
    uniqueIndex("customer_email_unique").on(table.email),
  ]
)
