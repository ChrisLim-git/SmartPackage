import type { PickupCodeHasher } from "@domain/interfaces/pickup-code-hasher"
import {
  PICKUP_CODE_ALPHABET,
  type PickupCode,
} from "@domain/utils/pickup-code"

/** A readable, deterministic stand-in for `HmacPickupCodeHasher`. */
export class FakePickupCodeHasher implements PickupCodeHasher {
  hash(code: PickupCode): string {
    // Injective, and the plaintext is never a substring of the output (lower
    // case, `0`/`1`), so a test can assert no field holds a code in the clear.
    const mapped = Array.from(code.toString(), (character) =>
      PICKUP_CODE_ALPHABET.indexOf(character).toString(36)
    ).join("")

    return `fake-hash:${mapped}`
  }

  matches(code: PickupCode, storedHash: string): boolean {
    return this.hash(code) === storedHash
  }
}
