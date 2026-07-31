import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

/** How many minor units make one major unit. Two-decimal currency, single-currency by scope. */
const MINOR_UNITS_PER_MAJOR = 100

/** Digits, then optionally a point and one or two more digits. No sign, no exponent, no separators. */
const DECIMAL_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/

const invalid = (reason: string): MalformedInput =>
  malformedInput("money", reason)

/**
 * An amount of money as a non-negative integer of minor units; a float never
 * holds an amount. `timesRatio` is the only lossy operation.
 */
export class Money {
  private constructor(private readonly minorUnits: number) {}

  /** The canonical constructor. Everything else funnels through it. */
  static fromMinorUnits(minorUnits: number): Result<Money, MalformedInput> {
    if (!Number.isInteger(minorUnits)) {
      return err(invalid("minor units must be a whole number"))
    }
    if (minorUnits < 0) {
      return err(invalid("an amount must not be negative"))
    }
    return ok(new Money(minorUnits))
  }

  /** Parses `"12.30"`, `"12.3"` or `"12"`. Three decimal places are rejected, not rounded. */
  static fromDecimalString(decimal: string): Result<Money, MalformedInput> {
    const match = DECIMAL_PATTERN.exec(decimal)
    if (match === null) {
      return err(
        invalid(`"${decimal}" is not an amount with at most two decimal places`)
      )
    }

    const [, major, fraction = ""] = match
    const minor = fraction.padEnd(2, "0")

    return Money.fromMinorUnits(
      Number(major) * MINOR_UNITS_PER_MAJOR + Number(minor)
    )
  }

  static zero(): Money {
    return new Money(0)
  }

  /** Cannot fail: both operands are already non-negative whole numbers. */
  plus(other: Money): Money {
    return new Money(this.minorUnits + other.minorUnits)
  }

  /** Repeated addition — a whole number of times, so nothing to round. */
  times(factor: number): Result<Money, MalformedInput> {
    if (!Number.isInteger(factor)) {
      return err(invalid("a multiplier must be a whole number"))
    }
    if (factor < 0) {
      return err(invalid("a multiplier must not be negative"))
    }
    return ok(new Money(this.minorUnits * factor))
  }

  /**
   * Scales by `numerator / denominator`, rounded half up to the nearest minor
   * unit. The only lossy operation — apply once, to a final total, not per tier.
   */
  timesRatio(
    numerator: number,
    denominator: number
  ): Result<Money, MalformedInput> {
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
      return err(invalid("a ratio must be two whole numbers"))
    }
    if (numerator < 0 || denominator <= 0) {
      return err(
        invalid("a ratio must be non-negative with a positive denominator")
      )
    }

    // floor((2·scaled + denominator) / 2·denominator) is half-up expressed in
    // integers, so the tie at .5 never depends on how a float landed.
    const scaled = this.minorUnits * numerator
    const rounded = Math.floor((scaled * 2 + denominator) / (denominator * 2))

    return ok(new Money(rounded))
  }

  equals(other: Money): boolean {
    return this.minorUnits === other.minorUnits
  }

  isZero(): boolean {
    return this.minorUnits === 0
  }

  toMinorUnits(): number {
    return this.minorUnits
  }

  /** Always two decimal places: `"12.30"`, never `"12.3"`. Built by slicing digits, so no float is involved. */
  toDecimalString(): string {
    const digits = String(this.minorUnits).padStart(3, "0")
    const boundary = digits.length - 2

    return `${digits.slice(0, boundary)}.${digits.slice(boundary)}`
  }
}
