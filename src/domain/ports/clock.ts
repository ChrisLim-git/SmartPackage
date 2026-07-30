/**
 * Where the domain gets the current time.
 *
 * `new Date()` inside a use case makes "the fee for a seven-day stay" a test
 * that takes seven days, and lint rejects it in `src/domain` for exactly that
 * reason. Infrastructure supplies `SystemClock`; tests supply a fixed or
 * advanceable one.
 */
export interface Clock {
  now(): Date
}
