import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import { auditColumns, primaryId } from "./columns"

/**
 * The size ladder, held as data rather than an enum: `rank` carries the whole
 * ordering rule, so adding an XL is an INSERT, not a deployment. One ladder
 * serves both lockers and packages so the fit policy can compare them.
 */
export const lockerSize = pgTable(
  "locker_size",
  {
    id: primaryId(),
    code: text("code").notNull(),
    rank: integer("rank").notNull(),
    label: text("label").notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("locker_size_code_unique").on(table.code),
    // Two sizes sharing one rank would make "does this fit" ambiguous.
    uniqueIndex("locker_size_rank_unique").on(table.rank),
  ]
)
