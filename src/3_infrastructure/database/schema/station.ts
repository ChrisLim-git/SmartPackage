import { pgTable, text } from "drizzle-orm/pg-core"

import { auditColumns, primaryId } from "./columns"

/**
 * A physical location holding lockers.
 *
 * `address` is not null on purpose: a station a customer cannot find is not a
 * station, and the collection page has to print something.
 */
export const station = pgTable("station", {
  id: primaryId(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  ...auditColumns,
})
