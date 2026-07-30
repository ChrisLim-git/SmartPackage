import type { PricingConfig } from "@domain/value-objects/pricing-config"

/**
 * The base rate and its fee table, as one validated object.
 *
 * `PricingConfig.create` refuses a table with a gap, an overlap or no unbounded
 * band, so a repository returning one has already proved the fee table can
 * price any stay. Handing back a loose rate and a loose array of tiers would
 * move that check to whoever remembered to run it.
 */
export interface PricingRepository {
  currentConfig(): Promise<PricingConfig>
}
