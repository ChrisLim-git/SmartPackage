import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000

/**
 * A stay in whole chargeable days, minimum one. A "day" is a 24-hour elapsed
 * block from the moment of storage, never a calendar-date difference.
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

    // Ceiling with a floor of one: any stay is a day; exactly 24h is still one day.
    const whole = Math.floor(elapsed / MILLISECONDS_PER_DAY)
    const partial = elapsed % MILLISECONDS_PER_DAY > 0 ? 1 : 0

    return ok(new StorageDuration(elapsed, Math.max(1, whole + partial)))
  }
}
