import type { Money } from "../utils/money"
import type { PricingConfig } from "../utils/pricing-config"
import type { StorageDuration } from "../utils/storage-duration"

/**
 * One band of a stay as charged; `toDay` is the last day covered for this stay.
 * Carries a rate, not a subtotal — the total is rounded to money exactly once.
 */
export type ChargedBand = {
  readonly fromDay: number
  readonly toDay: number
  readonly days: number
  readonly ratePerDay: Money
}

/** What a stay cost and the bands that produced it, from one calculation. */
export type PricedStay = {
  readonly total: Money
  readonly bands: readonly ChargedBand[]
}

/** Prices a stay from chargeable days and a price table; touches no clock. */
export interface StorageFeeService {
  calculate(duration: StorageDuration, pricing: PricingConfig): PricedStay
}
