import type { PickupCodeHasher } from "@domain/ports/pickup-code-hasher"
import type { PickupCode } from "@domain/value-objects/pickup-code"

/**
 * Hashing without the crypto — a readable, deterministic stand-in.
 *
 * Deliberately not a real digest: a domain test that has to think about
 * HMAC has stopped testing the domain. The real one is
 * `HmacPickupCodeHasher`, and it has its own tests in infrastructure.
 */
export class FakePickupCodeHasher implements PickupCodeHasher {
  hash(code: PickupCode): string {
    // Each digit shifted into a letter. Deterministic and collision-free like
    // the real thing, and — the part that matters — the plaintext is not a
    // substring of the result, so a test can assert that no field of an entity
    // is holding the code in the clear.
    const shifted = Array.from(code.toString(), (digit) =>
      String.fromCharCode("a".charCodeAt(0) + Number(digit))
    ).join("")

    return `fake-hash:${shifted}`
  }

  matches(code: PickupCode, storedHash: string): boolean {
    return this.hash(code) === storedHash
  }
}
