import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"

import { auditColumns, primaryId } from "./columns"

/**
 * The size ladder, held as data rather than as an enum.
 *
 * `rank` carries the entire ordering rule — `OrdinalFitPolicy` compares ranks
 * and nothing else — so introducing an XL is an `INSERT`, not a deployment.
 *
 * One ladder serves both lockers and packages. A separate `package_size` table
 * would make the two incomparable, which is precisely the question the fit
 * policy exists to answer.
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
    // Rank is unique too: two sizes sharing one rank makes "does this fit"
    // ambiguous, and the policy would answer differently depending on row order.
    uniqueIndex("locker_size_rank_unique").on(table.rank),
  ]
)
