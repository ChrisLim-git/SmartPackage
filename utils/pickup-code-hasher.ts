import { createHmac, timingSafeEqual } from "node:crypto"

import type { PickupCodeHasher } from "@domain/interfaces/pickup-code-hasher"
import type { PickupCode } from "@domain/utils/pickup-code"

/**
 * The HMAC key the codes are hashed under.
 *
 * A constant in the source, not configuration. This is a demonstration system
 * with a local database, and one fewer variable to set is one fewer way for a
 * reviewer's clone to store packages nobody can collect. In a deployment it
 * would be read from a secret store instead: the pepper only defends the hashes
 * while it lives somewhere the database's reader cannot reach, and a value in
 * the repository is a value everyone with the repository has.
 */
export const PICKUP_CODE_PEPPER = "smartpackage/pickup-code/v1"

/** A SHA-256 digest as lowercase hex. Anything else in the column is corrupt, not a candidate. */
const STORED_HASH_PATTERN = /^[0-9a-f]{64}$/

/**
 * Hashes pickup codes for storage with HMAC-SHA256 under a server-side pepper.
 *
 * The pepper is doing real work. A pickup code is six characters over a
 * 30-symbol alphabet — 729 million candidates — which is minutes of GPU time
 * against a bare SHA-256 column, so a database read alone would become a master
 * key to every occupied locker. With the pepper held outside the database, the
 * same read yields nothing without also compromising the application host.
 *
 * Not bcrypt or argon2: this is verified on the collection path where a person
 * is standing at a locker, and the deliberate slowness that protects a
 * low-entropy human password buys little against a machine-generated code drawn
 * uniformly from 729 million — the size of the space is what is doing the work
 * here, not the cost of one attempt.
 *
 * Worth being exact about, because the earlier version of this note claimed the
 * real defence was an attempt cap: there is no attempt cap. It is stretch scope
 * and the README lists it as a known gap.
 */
export class HmacPickupCodeHasher implements PickupCodeHasher {
  constructor(private readonly pepper: string = PICKUP_CODE_PEPPER) {
    if (pepper.trim().length === 0) {
      // An empty pepper hashes every code under no key at all, and the column
      // becomes a plain digest of a small alphabet — a wordlist, not a hash.
      throw new Error("HmacPickupCodeHasher needs a pepper")
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
