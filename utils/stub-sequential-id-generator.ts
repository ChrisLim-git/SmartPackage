import type { IdGenerator } from "@domain/interfaces/id-generator"

/**
 * Predictable ids for readable test failures; zero-padded so they sort by issue
 * order like production's UUIDv7s. Invalid for a `uuid` column — repository
 * tests use the real `UuidV7Generator`.
 */
export class SequentialIdGenerator implements IdGenerator {
  private issued = 0

  constructor(private readonly prefix = "id") {}

  next(): string {
    this.issued += 1

    return `${this.prefix}-${String(this.issued).padStart(4, "0")}`
  }
}
