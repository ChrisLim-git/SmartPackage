import { createHmac, timingSafeEqual } from "node:crypto"

import type { PickupCodeHasher } from "@domain/interfaces/pickup-code-hasher"
import type { PickupCode } from "@domain/utils/pickup-code"

/**
 * The HMAC key the codes are hashed under. A constant, not env: this is a demo
 * system; a deployment would read it from a secret store the DB reader cannot reach.
 */
export const PICKUP_CODE_PEPPER = "smartpackage/pickup-code/v1"

/** A SHA-256 digest as lowercase hex. Anything else in the column is corrupt, not a candidate. */
const STORED_HASH_PATTERN = /^[0-9a-f]{64}$/

/**
 * HMAC-SHA256 under a server-side pepper: a bare digest of a 729M-candidate
 * code is brute-forceable from a database read alone.
 */
export class HmacPickupCodeHasher implements PickupCodeHasher {
  constructor(private readonly pepper: string = PICKUP_CODE_PEPPER) {
    if (pepper.trim().length === 0) {
      // An empty pepper degrades the column to a plain digest of a small alphabet.
      throw new Error("HmacPickupCodeHasher needs a pepper")
    }
  }

  hash(code: PickupCode): string {
    return createHmac("sha256", this.pepper)
      .update(code.toString())
      .digest("hex")
  }

  matches(code: PickupCode, storedHash: string): boolean {
    // `timingSafeEqual` throws on a length mismatch, so a corrupt row would
    // crash the collection route; guard the shape first.
    if (!STORED_HASH_PATTERN.test(storedHash)) return false

    return timingSafeEqual(
      Buffer.from(this.hash(code), "hex"),
      Buffer.from(storedHash, "hex")
    )
  }
}
