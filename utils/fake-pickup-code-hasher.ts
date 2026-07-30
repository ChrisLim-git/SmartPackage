import type { PickupCodeHasher } from "@domain/interfaces/pickup-code-hasher"
import {
  PICKUP_CODE_ALPHABET,
  type PickupCode,
} from "@domain/utils/pickup-code"

/**
 * Hashing without the crypto — a readable, deterministic stand-in.
 *
 * Deliberately not a real digest: a domain test that has to think about HMAC has
 * stopped testing the domain. The real one is `HmacPickupCodeHasher`, and it has
 * its own tests in infrastructure.
 */
export class FakePickupCodeHasher implements PickupCodeHasher {
  hash(code: PickupCode): string {
    // Each character replaced by its position in the alphabet, base 36. One
    // character in, one out, so it is injective like a real digest — and the
    // output is lower case and can contain `0` and `1`, none of which the
    // alphabet issues, so the plaintext is never a substring of the result. That
    // last property is what lets a test assert no field is holding a code in the
    // clear.
    //
    // An earlier version shifted `Number(digit)` into a letter, which was fine
    // for a numeric code and wrote a NUL byte the moment codes gained letters —
    // Postgres rejected the insert with "invalid byte sequence for encoding
    // UTF8" rather than anything that named the cause.
    const mapped = Array.from(code.toString(), (character) =>
      PICKUP_CODE_ALPHABET.indexOf(character).toString(36)
    ).join("")

    return `fake-hash:${mapped}`
  }

  matches(code: PickupCode, storedHash: string): boolean {
    return this.hash(code) === storedHash
  }
}
