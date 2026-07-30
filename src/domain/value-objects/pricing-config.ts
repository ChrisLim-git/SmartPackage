import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"
import type { FeeTier } from "./fee-tier"
import type { Money } from "./money"

export type PricingConfigAttributes = {
  readonly baseRate: Money
  readonly tiers: readonly FeeTier[]
}

const invalid = (reason: string): MalformedInput =>
  malformedInput("pricing", reason)

/**
 * A base rate and the fee table that scales it.
 *
 * Validated hard at construction, because every way a tier set can be wrong is
 * a revenue bug that nothing else will report: a gap is a day with no rate, an
 * overlap is a day with two, and a table with no unbounded band means a long
 * enough stay falls off the end and is stored for free.
 *
 * Unsorted input is rejected rather than reordered. Silently sorting would mean
 * the table an administrator reads is not the table that charges the customer.
 */
export class PricingConfig {
  private constructor(
    readonly baseRate: Money,
    readonly tiers: readonly FeeTier[]
  ) {}

  static create(
    attributes: PricingConfigAttributes
  ): Result<PricingConfig, MalformedInput> {
    const { baseRate, tiers } = attributes

    if (tiers.length === 0) {
      return err(invalid("at least one fee tier is required"))
    }
    if (tiers[0].fromDay !== 1) {
      return err(invalid("the first tier must start on day 1"))
    }

    const unbounded = tiers.filter((tier) => tier.isUnbounded)
    if (unbounded.length !== 1) {
      return err(
        invalid(
          "exactly one tier must be unbounded, or a long stay has no rate"
        )
      )
    }
    if (!tiers[tiers.length - 1].isUnbounded) {
      return err(invalid("the unbounded tier must be last"))
    }

    for (let index = 1; index < tiers.length; index += 1) {
      const previous = tiers[index - 1]
      const current = tiers[index]

      // One check covers gaps, overlaps and unsorted input: each band must
      // begin on the day after the one before it ended.
      if (previous.toDay === null || current.fromDay !== previous.toDay + 1) {
        return err(
          invalid("tiers must be sorted, contiguous and non-overlapping")
        )
      }
    }

    return ok(new PricingConfig(baseRate, [...tiers]))
  }
}
