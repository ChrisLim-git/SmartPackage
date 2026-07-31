import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

/**
 * `0`, `1`, `I`, `L`, `O` are excluded as misread pairs; `U` so random codes
 * cannot spell words.
 */
export const PICKUP_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

export const PICKUP_CODE_LENGTH = 6

const PICKUP_CODE_PATTERN = new RegExp(
  `^[${PICKUP_CODE_ALPHABET}]{${PICKUP_CODE_LENGTH}}$`
)

/**
 * The credential a recipient types to open a locker. Input is folded (trimmed,
 * upper-cased) but ambiguous characters are never remapped — a typo must not
 * become a different valid code.
 */
export class PickupCode {
  private constructor(private readonly value: string) {}

  static create(value: string): Result<PickupCode, MalformedInput> {
    const folded = value.trim().toUpperCase()

    if (!PICKUP_CODE_PATTERN.test(folded)) {
      return err(
        malformedInput(
          "pickup code",
          `must be ${PICKUP_CODE_LENGTH} characters, digits and letters, excluding 0, 1, I, L, O and U`
        )
      )
    }

    return ok(new PickupCode(folded))
  }

  equals(other: PickupCode): boolean {
    return this.value === other.value
  }

  /** The plaintext, for display to the person collecting and for hashing. Never persisted. */
  toString(): string {
    return this.value
  }
}
