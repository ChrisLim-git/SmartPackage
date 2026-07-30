import { createHmac, timingSafeEqual } from "node:crypto"

import type { PickupCodeHasher } from "@domain/interfaces/pickup-code-hasher"
import type { PickupCode } from "@domain/value-objects/pickup-code"

/** A SHA-256 digest as lowercase hex. Anything else in the column is corrupt, not a candidate. */
const STORED_HASH_PATTERN = /^[0-9a-f]{64}$/

/**
 * Hashes pickup codes for storage with HMAC-SHA256 under a server-side pepper.
 *
 * The pepper is doing real work. A pickup code is six digits — a million
 * candidates — so a bare SHA-256 column is reversed by exhaustive search in
 * about a second on a laptop, and a database read would become a master key to
 * every occupied locker. With the pepper held outside the database, the same
 * read yields nothing without also compromising the application host.
 *
 * Not bcrypt or argon2: this is verified on the collection path where a person
 * is standing at a locker, and the deliberate slowness that protects a
 * low-entropy human password buys little against a machine-generated code
 * whose real defence is the attempt cap.
 */
export class HmacPickupCodeHasher implements PickupCodeHasher {
  constructor(private readonly pepper: string) {
    if (pepper.trim().length === 0) {
      throw new Error(
        "HmacPickupCodeHasher needs a pepper — set PICKUP_CODE_PEPPER."
      )
    }
  }

  hash(code: PickupCode): string {
    return createHmac("sha256", this.pepper)
      .update(code.toString())
      .digest("hex")
  }

  matches(code: PickupCode, storedHash: string): boolean {
    // `timingSafeEqual` throws when the two buffers differ in length, so a
    // corrupt or truncated row would crash the collection route and, by
    // crashing, tell the caller something about the row.
    if (!STORED_HASH_PATTERN.test(storedHash)) return false

    return timingSafeEqual(
      Buffer.from(this.hash(code), "hex"),
      Buffer.from(storedHash, "hex")
    )
  }
}
