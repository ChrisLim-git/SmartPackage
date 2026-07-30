import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, isErr, ok, type Result } from "../shared/result"

/** Multipliers are held in hundredths, so ×1.5 is 150 and the arithmetic stays integral. */
export const MULTIPLIER_SCALE = 100

/** Digits, then optionally a point and one or two more. Same shape a two-decimal currency accepts. */
const MULTIPLIER_PATTERN = /^\d+(\.\d{1,2})?$/

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

    // Decided on the decimal the caller wrote, not on the float it became.
    // `2.2 * 100` is 220.00000000000003, so any tolerance tight enough to
    // catch a third decimal place also rejects 2.2 — 255 of the 2000
    // two-decimal multipliers, silently, and a x2.2 band cannot be configured.
    if (!MULTIPLIER_PATTERN.test(String(multiplier))) {
      // More precision than the currency has would need a rounding rule that
      // nobody has stated.
      return err(
        malformedInput(
          "fee tier",
          "a multiplier has at most two decimal places"
        )
      )
    }

    return ok(
      new FeeTier(fromDay, toDay, Math.round(multiplier * MULTIPLIER_SCALE))
    )
  }

  /**
   * Rebuilds a tier from the hundredths a repository read back.
   *
   * The database stores what this object stores, so going in through `create`
   * would mean dividing by 100 to produce a decimal that is immediately
   * multiplied by 100 again — a float round trip for a number that was already
   * the right integer.
   */
  static fromHundredths(attributes: {
    readonly fromDay: number
    readonly toDay: number | null
    readonly multiplierHundredths: number
  }): Result<FeeTier, MalformedInput> {
    const { fromDay, toDay, multiplierHundredths } = attributes

    if (!Number.isInteger(multiplierHundredths) || multiplierHundredths < 0) {
      return err(
        malformedInput("fee tier", "a multiplier must not be negative")
      )
    }

    // Reuses `create` for the day validation, then swaps in the exact integer.
    const validated = FeeTier.create({ fromDay, toDay, multiplier: 1 })

    return isErr(validated)
      ? validated
      : ok(new FeeTier(fromDay, toDay, multiplierHundredths))
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
