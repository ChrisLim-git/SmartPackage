import { isErr } from "../shared/result"
import { MULTIPLIER_SCALE } from "../utils/fee-tier"
import type { Money } from "../utils/money"
import type { PricingConfig } from "../utils/pricing-config"
import type { StorageDuration } from "../utils/storage-duration"
import type {
  ChargedBand,
  PricedStay,
  StorageFeeService,
} from "./storage-fee-service"

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
 *
 * The bands come back beside the total, from this one pass. That is the point:
 * a stay that crossed a boundary was charged at more than one rate, so no
 * single rate can explain it, and an explanation computed separately from the
 * charge is one that can disagree with it.
 */
export class TieredDailyRateFeeService implements StorageFeeService {
  calculate(duration: StorageDuration, pricing: PricingConfig): PricedStay {
    const { chargeableDays } = duration

    const bands: ChargedBand[] = []
    let weighted = 0

    for (const tier of pricing.tiers) {
      const days = tier.daysWithin(chargeableDays)

      // A band the stay never reached. Left out rather than reported as zero:
      // a two-day stay has no business being told what day eleven would cost.
      if (days === 0) continue

      weighted += days * tier.multiplierHundredths

      bands.push({
        fromDay: tier.fromDay,
        // The unbounded band ends where the stay ended, not on nothing.
        toDay: tier.fromDay + days - 1,
        days,
        ratePerDay: this.rateFor(pricing.baseRate, tier.multiplierHundredths),
      })
    }

    const total = pricing.baseRate.timesRatio(weighted, MULTIPLIER_SCALE)

    if (isErr(total)) {
      // Unreachable: the tier set validated its multipliers as non-negative
      // whole hundredths, and the scale is a positive constant. A throw here
      // means this class has a bug, which is what an exception is for.
      throw new Error(
        `fee calculation produced an invalid amount: ${total.error.message}`
      )
    }

    return { total: total.value, bands }
  }

  /**
   * What a day in this band costs, for display.
   *
   * Rounded to the currency, which the total is not — the total accumulates
   * across every band first. So a rate can read a cent away from what the total
   * implies for an odd multiplier on a small base, and that is the honest
   * direction for the discrepancy to run: the number charged stays exact, and
   * the number shown is the one a person can read.
   */
  private rateFor(baseRate: Money, multiplierHundredths: number): Money {
    const rate = baseRate.timesRatio(multiplierHundredths, MULTIPLIER_SCALE)

    if (isErr(rate)) {
      throw new Error(
        `fee calculation produced an invalid rate: ${rate.error.message}`
      )
    }

    return rate.value
  }
}
