import { isErr } from "../shared/result"
import type { Money } from "../value-objects/money"
import type { PricingConfig } from "../value-objects/pricing-config"
import type { StorageDuration } from "../value-objects/storage-duration"
import type { StorageFeePolicy } from "./storage-fee-policy"

/** Matches `FeeTier`'s scale: multipliers are integer hundredths. */
const MULTIPLIER_SCALE = 100

/**
 * Charges each band at its own rate and adds the bands up.
 *
 * A seven-day stay under (1–5, ×1) (6–10, ×2) is five days at the base rate
 * plus two at double — nine times base, not fourteen. Applying the highest band
 * reached to the whole stay is the common misreading of tiered pricing, and it
 * overcharges every customer who crosses a boundary.
 *
 * The sum is accumulated in whole multiplier-hundredths and converted to money
 * once, at the end. Rounding each band instead would collect up to half a cent
 * of error per band, in the operator's favour every time.
 */
export class TieredDailyRateFeePolicy implements StorageFeePolicy {
  calculate(duration: StorageDuration, pricing: PricingConfig): Money {
    const weighted = pricing.tiers.reduce(
      (total, tier) =>
        total +
        tier.daysWithin(duration.chargeableDays) * tier.multiplierHundredths,
      0
    )

    const fee = pricing.baseRate.timesRatio(weighted, MULTIPLIER_SCALE)

    if (isErr(fee)) {
      // Unreachable: the tier set validated its multipliers as non-negative
      // whole hundredths, and the scale is a positive constant. A throw here
      // means this class has a bug, which is what an exception is for.
      throw new Error(
        `fee calculation produced an invalid amount: ${fee.error.message}`
      )
    }

    return fee.value
  }
}
