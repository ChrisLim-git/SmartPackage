import { sql } from "drizzle-orm"
import {
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import type { PackageStatus } from "@domain/entities/package"

import { user } from "./auth-schema"
import { auditColumns, primaryId } from "./columns"
import { customer } from "./customer"
import { locker } from "./locker"
import { lockerSize } from "./locker-size"

/** Tied to the domain union, like `locker_status`. */
const PACKAGE_STATUSES = [
  "stored",
  "retrieved",
] as const satisfies readonly PackageStatus[]

export const packageStatus = pgEnum("package_status", PACKAGE_STATUSES)

/**
 * A parcel in a locker. Exported as `packageTable` — `package` is a reserved
 * word in strict mode. `pickup_code_hash` is named to forbid plaintext: the
 * code is a bearer credential. `stored_by` is a domain fact (the answerable
 * agent), not an audit stamp; there is no `retrieved_by` because collection
 * needs no account.
 */
export const packageTable = pgTable(
  "package",
  {
    id: primaryId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    sizeId: uuid("size_id")
      .notNull()
      .references(() => lockerSize.id),
    // Kept after collection as audit trail; the locker is freed by its own status.
    lockerId: uuid("locker_id")
      .notNull()
      .references(() => locker.id),
    pickupCodeHash: text("pickup_code_hash").notNull(),
    status: packageStatus("status").notNull().default("stored"),
    storedAt: timestamp("stored_at", { withTimezone: true }).notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    // Null until collection. Never `mode: "number"`.
    feeCharged: numeric("fee_charged", { precision: 12, scale: 2 }),
    storedBy: uuid("stored_by")
      .notNull()
      .references(() => user.id),
    ...auditColumns,
  },
  (table) => [
    // One stored parcel per code. Partial: a collected parcel keeps its hash as
    // audit trail. Every upsert must repeat this predicate in `targetWhere` —
    // Postgres will not infer a partial index in ON CONFLICT. Raw sql, not
    // `eq(...)`: the builder would emit a bound parameter into the migration,
    // and DDL takes no parameters.
    uniqueIndex("package_stored_pickup_code_unique")
      .on(table.pickupCodeHash)
      .where(sql`status = 'stored' AND deleted_at IS NULL`),
  ]
)
