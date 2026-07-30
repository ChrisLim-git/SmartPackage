/**
 * Where the domain gets identity.
 *
 * Entities are given their id at construction rather than by the database, so
 * an entity is complete and assertable before anything is persisted, and a use
 * case can be tested with no database at all. The real implementation is
 * UUIDv7 — time-ordered, so the primary-key index does not fragment.
 */
export interface IdGenerator {
  next(): string
}
