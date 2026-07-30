import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000

/**
 * How long a package sat in a locker, expressed in the only unit the fee model
 * charges in: whole days, minimum one.
 *
 * A "day" is a 24-hour elapsed block from the moment of storage, never a
 * difference between calendar dates. The distinction is invisible until a
 * daylight-saving change or a one-minute stay just before midnight, at which
 * point date arithmetic charges for a day nobody used.
 *
 * Isolating the rule here is what makes each fee boundary a one-line test
 * rather than a fixture that has to construct a package.
 */
export class StorageDuration {
  private constructor(
    readonly elapsedMilliseconds: number,
    readonly chargeableDays: number
  ) {}

  static from(
    storedAt: Date,
    retrievedAt: Date
  ): Result<StorageDuration, MalformedInput> {
    const from = storedAt.getTime()
    const to = retrievedAt.getTime()

    if (Number.isNaN(from) || Number.isNaN(to)) {
      return err(malformedInput("storage duration", "the dates must be valid"))
    }
    if (to < from) {
      return err(
        malformedInput(
          "storage duration",
          "a package cannot be collected before it was stored"
        )
      )
    }

    const elapsed = to - from

    // Integer ceiling with a floor of one: a stay of any length is a day, and
    // a stay of exactly 24 hours is still one day — day two starts a
    // millisecond later.
    const whole = Math.floor(elapsed / MILLISECONDS_PER_DAY)
    const partial = elapsed % MILLISECONDS_PER_DAY > 0 ? 1 : 0

    return ok(new StorageDuration(elapsed, Math.max(1, whole + partial)))
  }
}
