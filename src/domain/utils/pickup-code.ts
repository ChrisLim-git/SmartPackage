import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

/**
 * The characters a code may contain, and the ones deliberately left out.
 *
 * `0`, `1`, `I`, `L`, `O` and `U` are absent. The first five are the pairs a
 * person misreads off a phone or a printed slip — a zero read as an O costs a
 * customer a locker that will not open, and they cannot tell which half was
 * wrong because every rejection answers identically. `U` goes for the older
 * reason: six random characters eventually spell something, and a code nobody
 * wants to read aloud at a service desk is a support call.
 */
export const PICKUP_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

export const PICKUP_CODE_LENGTH = 6

const PICKUP_CODE_PATTERN = new RegExp(
  `^[${PICKUP_CODE_ALPHABET}]{${PICKUP_CODE_LENGTH}}$`
)

/**
 * The credential a recipient types to open a locker.
 *
 * Six characters from a 30-symbol alphabet — 729 million codes, against a
 * million if it were digits only. That difference is the reason the charset is
 * not numeric: the code identifies a parcel *on its own*, with no locker number
 * and no account beside it, so somebody trying codes at random is trying for any
 * parcel in the network rather than for one locker's. Three orders of magnitude
 * is what makes that arithmetic uninteresting — and it is also why a collision
 * between two live codes is a curiosity rather than something to design around.
 *
 * Input is folded — trimmed and upper-cased — because a person typing on a phone
 * gets lower case by default and meant the same code either way. An ambiguous
 * character is *not* remapped: `0` is not quietly read as `O`, because a code
 * containing either was never issued, and guessing at intent would let one typo
 * become a different valid code.
 *
 * The value stays a `string` from end to end. `"000123"` was never a number, and
 * neither is `"K4M9PT"`.
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
