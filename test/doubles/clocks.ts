import type { Clock } from "@domain/interfaces/clock"

const UNIT_MILLISECONDS: Record<string, number> = {
  s: 1_000,
  m: 60 * 1_000,
  h: 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
}

const DURATION_PATTERN = /^(\d+)([smhd])$/

/** A clock stopped at one instant. */
export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    // A copy: `Date` is mutable, and a caller that does `clock.now().setHours(…)`
    // would otherwise move everyone else's clock too.
    return new Date(this.instant.getTime())
  }
}

/** A clock a test can push forward: `clock.advanceBy("7d")`. */
export class AdvanceableClock implements Clock {
  private instant: number

  constructor(start: Date) {
    this.instant = start.getTime()
  }

  now(): Date {
    return new Date(this.instant)
  }

  /** `"30s"`, `"5m"`, `"24h"`, `"7d"`. Throws on anything else. */
  advanceBy(duration: string): void {
    const match = DURATION_PATTERN.exec(duration)

    if (match === null) {
      // Ignoring an unparseable duration would leave a fee test asserting the
      // first day's rate and calling it a seven-day stay.
      throw new Error(
        `AdvanceableClock cannot read "${duration}" — use a form like "7d", "24h", "5m" or "30s"`
      )
    }

    const [, amount, unit] = match
    this.instant += Number(amount) * UNIT_MILLISECONDS[unit]
  }
}
