import type { Money } from "../utils/money"
import type { PricingConfig } from "../utils/pricing-config"
import type { StorageDuration } from "../utils/storage-duration"

/**
 * One band of a stay, as it was actually charged.
 *
 * `toDay` is the last day this band covered *for this stay*, so the unbounded
 * band ends on the day the parcel left rather than on nothing — "days 6 to 7",
 * not "days 6 onwards".
 *
 * A rate, and deliberately not a subtotal. The total is accumulated in whole
 * multiplier-hundredths and converted to money exactly once; a per-band amount
 * would round each band and collect up to half a cent per band, every time in
 * the operator's favour.
 */
export type ChargedBand = {
  readonly fromDay: number
  readonly toDay: number
  readonly days: number
  readonly ratePerDay: Money
}

/**
 * What a stay cost, and how it got there.
 *
 * The two travel together because they have to agree. A fee explained from a
 * second calculation is a fee that can contradict itself on screen — and the
 * explanation is a requirement, not a nicety: an unexplained charge at a locker
 * is where trust breaks.
 */
export type PricedStay = {
  readonly total: Money
  readonly bands: readonly ChargedBand[]
}

/**
 * What a stay costs.
 *
 * Takes chargeable days and a price table, and touches no clock — which is what
 * makes a seven-day stay a one-line test. A different pricing shape (per-hour,
 * per-size, promotional) is a different implementation of this interface, not
 * an edit to the one below.
 */
export interface StorageFeeService {
  calculate(duration: StorageDuration, pricing: PricingConfig): PricedStay
}
