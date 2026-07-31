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
 * A base rate and the fee table that scales it. Validated at construction:
 * gaps, overlaps, a missing unbounded band, and unsorted input are all rejected.
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

      // Each band must begin the day after the previous ended; covers gaps, overlaps, unsorted input.
      if (previous.toDay === null || current.fromDay !== previous.toDay + 1) {
        return err(
          invalid("tiers must be sorted, contiguous and non-overlapping")
        )
      }
    }

    return ok(new PricingConfig(baseRate, [...tiers]))
  }
}
