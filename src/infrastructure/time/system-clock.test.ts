import { SystemClock } from "./system-clock"

describe("SystemClock", () => {
  it("reads the machine clock", () => {
    const before = Date.now()

    const now = new SystemClock().now().getTime()

    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(Date.now())
  })

  it("moves, unlike a FixedClock", () => {
    const clock = new SystemClock()

    expect(clock.now().getTime()).toBeGreaterThanOrEqual(
      clock.now().getTime() - 1
    )
  })
})
