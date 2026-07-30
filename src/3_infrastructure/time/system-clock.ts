import type { Clock } from "@domain/interfaces/clock"

/** The machine clock. The one place in the application allowed to call `new Date()`. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}
