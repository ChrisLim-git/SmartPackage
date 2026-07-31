import { AdvanceableClock, FixedClock } from "@/utils/fake-clocks"

/** Contract for the `Clock` test doubles; `SystemClock` is covered in infrastructure. */
describe("FixedClock", () => {
  it("returns the same instant however often it is asked", () => {
    const instant = new Date("2026-01-01T00:00:00.000Z")
    const clock = new FixedClock(instant)

    expect(clock.now().toISOString()).toBe(instant.toISOString())
    expect(clock.now().toISOString()).toBe(instant.toISOString())
  })

  it("hands out a copy, so a caller cannot move the clock by mutating a Date", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"))

    clock.now().setFullYear(1999)

    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z")
  })
})

describe("AdvanceableClock", () => {
  it("moves forward by a duration a fee test can read", () => {
    const clock = new AdvanceableClock(new Date("2026-01-01T00:00:00.000Z"))

    clock.advanceBy("7d")

    expect(clock.now().toISOString()).toBe("2026-01-08T00:00:00.000Z")
  })

  it("understands seconds, minutes, hours and days", () => {
    const clock = new AdvanceableClock(new Date("2026-01-01T00:00:00.000Z"))

    clock.advanceBy("1s")
    clock.advanceBy("2m")
    clock.advanceBy("3h")

    expect(clock.now().toISOString()).toBe("2026-01-01T03:02:01.000Z")
  })

  it("accumulates advances rather than resetting", () => {
    const clock = new AdvanceableClock(new Date("2026-01-01T00:00:00.000Z"))

    clock.advanceBy("1d")
    clock.advanceBy("1d")

    expect(clock.now().toISOString()).toBe("2026-01-03T00:00:00.000Z")
  })

  it("throws on a duration it does not understand, rather than not moving", () => {
    const clock = new AdvanceableClock(new Date("2026-01-01T00:00:00.000Z"))

    // Silent ignore would make fee tests pass for the wrong reason.
    expect(() => clock.advanceBy("7 days")).toThrow()
    expect(() => clock.advanceBy("d7")).toThrow()
    expect(() => clock.advanceBy("")).toThrow()
  })
})
