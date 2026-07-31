import { isErr, isOk, type Result } from "../shared/result"
import { Money } from "./money"

/** Unwraps a construction the test knows is valid. A throw here is a broken test, not a failing one. */
const unwrap = <T>(result: Result<T, { message: string }>): T => {
  if (isErr(result))
    throw new Error(`test setup failed: ${result.error.message}`)
  return result.value
}

const money = (decimal: string): Money =>
  unwrap(Money.fromDecimalString(decimal))

describe("Money", () => {
  describe("construction", () => {
    it("reads a two-decimal string as minor units", () => {
      expect(money("2.00").toMinorUnits()).toBe(200)
    })

    it("accepts a single decimal place", () => {
      expect(money("2.5").toMinorUnits()).toBe(250)
    })

    it("accepts a whole number with no decimal point", () => {
      expect(money("2").toMinorUnits()).toBe(200)
    })

    it("rejects more precision than the currency has", () => {
      const result = Money.fromDecimalString("2.005")

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe("MalformedInput")
    })

    it("rejects a negative amount", () => {
      expect(isErr(Money.fromDecimalString("-2.00"))).toBe(true)
      expect(isErr(Money.fromMinorUnits(-1))).toBe(true)
    })

    it("rejects minor units that are not a whole number", () => {
      expect(isErr(Money.fromMinorUnits(1.5))).toBe(true)
    })

    it("rejects a string that is not a number at all", () => {
      for (const text of ["", "abc", "1.2.3", "1e2", " 1.00", "1,00"]) {
        expect(isErr(Money.fromDecimalString(text))).toBe(true)
      }
    })

    it("starts at zero", () => {
      expect(Money.zero().toMinorUnits()).toBe(0)
      expect(Money.zero().isZero()).toBe(true)
    })
  })

  describe("arithmetic", () => {
    it("adds exactly, where a float would not: 0.10 + 0.20 is 0.30", () => {
      expect(money("0.10").plus(money("0.20")).toDecimalString()).toBe("0.30")
    })

    it("adds commutatively", () => {
      const a = money("1.15")
      const b = money("2.70")

      expect(a.plus(b).equals(b.plus(a))).toBe(true)
    })

    it("multiplies exactly: 0.10 three times is 0.30, never 0.30000000000000004", () => {
      expect(unwrap(money("0.10").times(3)).toDecimalString()).toBe("0.30")
    })

    it("multiplies by zero to zero", () => {
      expect(unwrap(money("4.99").times(0)).isZero()).toBe(true)
    })

    it("rejects a fractional multiplier", () => {
      expect(isErr(money("1.00").times(1.5))).toBe(true)
    })

    it("rejects a negative multiplier", () => {
      expect(isErr(money("1.00").times(-1))).toBe(true)
    })

    it("leaves the receiver untouched — a Money is immutable", () => {
      const original = money("1.00")

      const sum = original.plus(money("2.00"))

      expect(original.toDecimalString()).toBe("1.00")
      expect(sum).not.toBe(original)
      expect(sum.toDecimalString()).toBe("3.00")
    })

    it("stays exact at a large amount", () => {
      const large = money("999999.99")

      expect(large.toMinorUnits()).toBe(99999999)
      expect(large.plus(money("0.01")).toDecimalString()).toBe("1000000.00")
    })
  })

  describe("rounding a ratio, the one place division is allowed", () => {
    it("rounds a half up: 0.125 becomes 0.13", () => {
      expect(unwrap(money("0.25").timesRatio(1, 2)).toDecimalString()).toBe(
        "0.13"
      )
    })

    it("rounds below a half down: 0.124 becomes 0.12", () => {
      expect(unwrap(money("0.62").timesRatio(1, 5)).toDecimalString()).toBe(
        "0.12"
      )
    })

    it("leaves an exact ratio alone", () => {
      expect(unwrap(money("10.00").timesRatio(3, 2)).toDecimalString()).toBe(
        "15.00"
      )
    })

    it("rejects a zero denominator", () => {
      expect(isErr(money("1.00").timesRatio(1, 0))).toBe(true)
    })
  })

  describe("output", () => {
    it("always prints two decimal places", () => {
      expect(unwrap(Money.fromMinorUnits(1230)).toDecimalString()).toBe("12.30")
    })

    it("pads an amount smaller than a major unit", () => {
      expect(unwrap(Money.fromMinorUnits(5)).toDecimalString()).toBe("0.05")
      expect(Money.zero().toDecimalString()).toBe("0.00")
    })

    it("compares by value, not by identity", () => {
      expect(money("3.00").equals(money("3.00"))).toBe(true)
      expect(money("3.00").equals(money("3.01"))).toBe(false)
    })
  })

  it("never exposes a divide", () => {
    // `timesRatio` is the only division, and it states its rounding.
    const surface = Money.zero() as unknown as Record<string, unknown>

    expect(surface.divide).toBeUndefined()
  })

  it("returns a Result rather than throwing on bad input", () => {
    const result = Money.fromDecimalString("nope")

    expect(isOk(result)).toBe(false)
  })
})
