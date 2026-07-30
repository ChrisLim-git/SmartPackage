import type { Money } from "../value-objects/money"
import type { PricingConfig } from "../value-objects/pricing-config"
import type { StorageDuration } from "../value-objects/storage-duration"

/**
 * What a stay costs.
 *
 * Takes chargeable days and a price table, and touches no clock — which is what
 * makes a seven-day stay a one-line test. A different pricing shape (per-hour,
 * per-size, promotional) is a different implementation of this interface, not
 * an edit to the one below.
 */
export interface StorageFeePolicy {
  calculate(duration: StorageDuration, pricing: PricingConfig): Money
}
