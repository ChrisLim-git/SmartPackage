import type { PickupCode } from "../value-objects/pickup-code"

/**
 * Turns a pickup code into the opaque value that is safe to store, and answers
 * whether a presented code matches one.
 *
 * An interface for the same reason as the generator: hashing is `node:crypto`, which
 * the domain cannot import. Keeping it an interface also means the comparison
 * is constant-time in one place — implementations must not expose a
 * `hashToCode`, because there is no such direction.
 */
export interface PickupCodeHasher {
  hash(code: PickupCode): string

  /** Constant-time. Returns false — never throws — for a stored value of the wrong shape. */
  matches(code: PickupCode, storedHash: string): boolean
}
