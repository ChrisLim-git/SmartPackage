import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

/** Six digits, thumb-typed on a phone keypad. */
const PICKUP_CODE_PATTERN = /^\d{6}$/

/**
 * The credential a recipient types to open a locker.
 *
 * Digits only, because the person entering it is standing at a locker wall
 * holding a phone; a numeric keypad is the whole reason the charset is not
 * alphanumeric. Six digits is a million possibilities, which is thin on its
 * own — the attempt cap and the peppered hash at rest are what make it
 * defensible, and both are named in the README.
 *
 * The value stays a `string` from end to end. `"000123"` is not 123.
 */
export class PickupCode {
  private constructor(private readonly value: string) {}

  static create(value: string): Result<PickupCode, MalformedInput> {
    if (!PICKUP_CODE_PATTERN.test(value)) {
      return err(malformedInput("pickup code", "must be exactly six digits"))
    }
    return ok(new PickupCode(value))
  }

  equals(other: PickupCode): boolean {
    return this.value === other.value
  }

  /** The plaintext, for display to the person collecting and for hashing. Never persisted. */
  toString(): string {
    return this.value
  }
}
