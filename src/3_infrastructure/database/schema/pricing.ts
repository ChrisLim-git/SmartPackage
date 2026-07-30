import { integer, numeric, pgTable, text } from "drizzle-orm/pg-core"

import { auditColumns, primaryId } from "./columns"

/**
 * The base rate every stay is charged from, before the tier table scales it.
 *
 * `numeric(12,2)` and **never `mode: "number"`**. Drizzle returns `numeric` as
 * a `string`, which is correct and deliberate: `mode: "number"` maps it through
 * `Number()` and reintroduces the binary-float error the whole money design
 * avoids — silently, with no failing test until one specific amount drifts.
 * The string is converted at the `Money` boundary, never with `parseFloat`.
 */
export const pricingConfig = pgTable("pricing_config", {
  id: primaryId(),
  baseRatePerDay: numeric("base_rate_per_day", {
    precision: 12,
    scale: 2,
  }).notNull(),
  currencyCode: text("currency_code").notNull(),
  ...auditColumns,
})

/**
 * One band of the fee table: days `from_day` to `to_day` at `multiplier`.
 *
 * `to_day` is nullable and null means unbounded — the band that catches every
 * day past the end of the table. `PricingConfig` refuses a table without
 * exactly one of them, because a stay falling off the end is stored for free.
 *
 * The column is `multiplier_hundredths`, not `multiplier`: the value stored is
 * 150 for ×1.5, matching the domain's integer arithmetic. A column called
 * `multiplier` holding 150 is a misreading waiting to happen — by a person
 * running a query, or by the next writer of a repository.
 */
export const feeTier = pgTable("fee_tier", {
  id: primaryId(),
  fromDay: integer("from_day").notNull(),
  toDay: integer("to_day"),
  multiplierHundredths: integer("multiplier_hundredths").notNull(),
  ...auditColumns,
})
