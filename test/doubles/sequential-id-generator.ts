import type { IdGenerator } from "@domain/interfaces/id-generator"

/**
 * Predictable ids, so a failed assertion reads `locker-0002` instead of a
 * UUID nobody can trace back to a line of the test.
 *
 * Zero-padded because the real generator is UUIDv7 and sorts by creation time;
 * a double where `id-10` sorted before `id-9` would let an ordering test pass
 * that production fails.
 */
export class SequentialIdGenerator implements IdGenerator {
  private issued = 0

  constructor(private readonly prefix = "id") {}

  next(): string {
    this.issued += 1

    return `${this.prefix}-${String(this.issued).padStart(4, "0")}`
  }
}
