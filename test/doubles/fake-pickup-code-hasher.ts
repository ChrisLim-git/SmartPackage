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
    return `hashed:${code.toString()}`
  }

  matches(code: PickupCode, storedHash: string): boolean {
    return this.hash(code) === storedHash
  }
}
