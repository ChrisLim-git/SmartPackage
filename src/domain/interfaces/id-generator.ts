/**
 * Identity source; entities get ids at construction, not from the database.
 * Real implementation is UUIDv7 (time-ordered, index-friendly).
 */
export interface IdGenerator {
  next(): string
}
