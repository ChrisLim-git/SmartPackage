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
 * Charges each band at its own rate and sums — not the highest band applied to
 * the whole stay. Accumulates in multiplier-hundredths, converting to money once at the end.
 */
export class TieredDailyRateFeeService implements StorageFeeService {
  calculate(duration: StorageDuration, pricing: PricingConfig): PricedStay {
    const { chargeableDays } = duration

    const bands: ChargedBand[] = []
    let weighted = 0

    for (const tier of pricing.tiers) {
      const days = tier.daysWithin(chargeableDays)

      // Bands the stay never reached are omitted, not reported as zero.
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
      // Unreachable: tiers validated multipliers as non-negative whole
      // hundredths; a throw here means this class has a bug.
      throw new Error(
        `fee calculation produced an invalid amount: ${total.error.message}`
      )
    }

    return { total: total.value, bands }
  }

  /**
   * Per-day rate for display, rounded to the currency; the charged total
   * accumulates unrounded across bands, so the two may differ by a cent.
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
