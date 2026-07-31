import { integer, numeric, pgTable, text } from "drizzle-orm/pg-core"

import { auditColumns, primaryId } from "./columns"

/**
 * The base rate every stay is charged from. `numeric(12,2)` and never
 * `mode: "number"` — Drizzle returns `numeric` as a string, converted at the
 * `Money` boundary, never with `parseFloat`.
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
 * One band of the fee table. A null `to_day` means unbounded; `PricingConfig`
 * requires exactly one such band. `multiplier_hundredths` stores 150 for x1.5,
 * matching the domain's integer arithmetic — the name prevents misreading.
 */
export const feeTier = pgTable("fee_tier", {
  id: primaryId(),
  fromDay: integer("from_day").notNull(),
  toDay: integer("to_day"),
  multiplierHundredths: integer("multiplier_hundredths").notNull(),
  ...auditColumns,
})
