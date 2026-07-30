import { uuidv7 } from "uuidv7"

import type { IdGenerator } from "@domain/ports/id-generator"

/**
 * UUIDv7 ids, generated in the application rather than by the database.
 *
 * v7 embeds a millisecond timestamp in its high bits, so ids sort by creation
 * time: inserts land at the end of the primary-key index instead of scattering
 * across it the way v4 does. Postgres 18 can also produce them (`DEFAULT
 * uuidv7()`), and that default stays as a safety net — but an entity gets its
 * id here, so it is complete and testable before it ever reaches a repository.
 */
export class UuidV7Generator implements IdGenerator {
  next(): string {
    return uuidv7()
  }
}
