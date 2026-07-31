import { pgTable, text } from "drizzle-orm/pg-core"

import { auditColumns, primaryId } from "./columns"

/** A physical location holding lockers. */
export const station = pgTable("station", {
  id: primaryId(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  ...auditColumns,
})
