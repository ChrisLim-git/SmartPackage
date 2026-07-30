import {
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
 * A parcel in a locker.
 *
 * Exported as `packageTable` rather than `package`, because `package` is a
 * reserved word in strict mode and every module is strict — `const package =`
 * does not parse. The table is named `package` like every other one here.
 *
 * `pickup_code_hash` is the column name deliberately. Naming it `pickup_code`
 * invites someone to write plaintext into it, and the code is a bearer
 * credential for a physical object: one `SELECT` would then open every occupied
 * locker in the network.
 *
 * `stored_by` is a domain fact, not an audit stamp — the agent answerable for
 * the parcel, with a real key into `user`. It usually equals `created_by`, and
 * that is fine: `created_by` records whatever wrote the row, including a seed
 * or a migration, while this records a person taking responsibility.
 *
 * There is no `retrieved_by`, and the asymmetry is the point: collection needs
 * no account at all, only the code.
 */
export const packageTable = pgTable("package", {
  id: primaryId(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customer.id),
  sizeId: uuid("size_id")
    .notNull()
    .references(() => lockerSize.id),
  // Kept after collection rather than cleared: which locker held the parcel is
  // the audit trail, and the locker is freed by its own status, not by this.
  lockerId: uuid("locker_id")
    .notNull()
    .references(() => locker.id),
  pickupCodeHash: text("pickup_code_hash").notNull(),
  status: packageStatus("status").notNull().default("stored"),
  storedAt: timestamp("stored_at", { withTimezone: true }).notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
  // Null until collection: the fee is not known until the stay ends. Same
  // `numeric(12,2)`, same prohibition on `mode: "number"`.
  feeCharged: numeric("fee_charged", { precision: 12, scale: 2 }),
  storedBy: uuid("stored_by")
    .notNull()
    .references(() => user.id),
  ...auditColumns,
})
