import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

/** Multipliers are held in hundredths, so ×1.5 is 150 and the arithmetic stays integral. */
const MULTIPLIER_SCALE = 100

export type FeeTierAttributes = {
  readonly fromDay: number
  /** `null` means unbounded — the band that catches every day past the table. */
  readonly toDay: number | null
  readonly multiplier: number
}

/**
 * One band of the fee table: days `fromDay` to `toDay`, charged at `multiplier`
 * times the base rate.
 *
 * The multiplier is stored as an integer number of hundredths rather than as
 * the decimal it was given, so summing bands never touches a float and the one
 * rounding step stays where `Money` puts it — on the final total.
 */
export class FeeTier {
  private constructor(
    readonly fromDay: number,
    readonly toDay: number | null,
    readonly multiplierHundredths: number
  ) {}

  static create(
    attributes: FeeTierAttributes
  ): Result<FeeTier, MalformedInput> {
    const { fromDay, toDay, multiplier } = attributes

    if (!Number.isInteger(fromDay) || fromDay < 1) {
      return err(
        malformedInput("fee tier", "a band starts on a whole day, from day 1")
      )
    }
    if (toDay !== null && (!Number.isInteger(toDay) || toDay < fromDay)) {
      return err(
        malformedInput(
          "fee tier",
          "a band ends on a whole day, on or after it starts"
        )
      )
    }
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      return err(
        malformedInput("fee tier", "a multiplier must not be negative")
      )
    }

    const hundredths = multiplier * MULTIPLIER_SCALE
    if (
      Math.abs(hundredths - Math.round(hundredths)) >
      Number.EPSILON * MULTIPLIER_SCALE
    ) {
      // More precision than the currency has would need a rounding rule that
      // nobody has stated.
      return err(
        malformedInput(
          "fee tier",
          "a multiplier has at most two decimal places"
        )
      )
    }

    return ok(new FeeTier(fromDay, toDay, Math.round(hundredths)))
  }

  get isUnbounded(): boolean {
    return this.toDay === null
  }

  /** How many of a stay's chargeable days fall inside this band. */
  daysWithin(chargeableDays: number): number {
    if (chargeableDays < this.fromDay) return 0

    const lastDay =
      this.toDay === null
        ? chargeableDays
        : Math.min(this.toDay, chargeableDays)

    return lastDay - this.fromDay + 1
  }
}
