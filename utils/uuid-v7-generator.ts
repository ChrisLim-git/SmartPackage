import { uuidv7 } from "uuidv7"

import type { IdGenerator } from "@domain/interfaces/id-generator"

/**
 * UUIDv7 ids (time-ordered, index-friendly), minted in the application so an
 * entity is complete before it reaches a repository.
 */
export class UuidV7Generator implements IdGenerator {
  next(): string {
    return uuidv7()
  }
}
