import type { PickupCode } from "../utils/pickup-code"

/**
 * One-way hash of pickup codes for storage and matching; there is no
 * hash-to-code direction.
 */
export interface PickupCodeHasher {
  hash(code: PickupCode): string

  /** Constant-time. Returns false — never throws — for a stored value of the wrong shape. */
  matches(code: PickupCode, storedHash: string): boolean
}
