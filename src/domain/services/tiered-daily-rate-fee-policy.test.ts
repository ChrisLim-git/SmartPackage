import { unwrap } from "@/test/support/unwrap"

import { Money } from "../utils/money"
import { FeeTier } from "../utils/fee-tier"
import { PricingConfig } from "../utils/pricing-config"
import { StorageDuration } from "../utils/storage-duration"
import { TieredDailyRateFeePolicy } from "./tiered-daily-rate-fee-policy"

const DAY = 24 * 60 * 60 * 1_000
const STORED_AT = new Date("2026-01-01T00:00:00.000Z")

const stay = (days: number): StorageDuration =>
  unwrap(
    StorageDuration.from(STORED_AT, new Date(STORED_AT.getTime() + days * DAY))
  )

const tier = (fromDay: number, toDay: number | null, multiplier: number) =>
  unwrap(FeeTier.create({ fromDay, toDay, multiplier }))

const pricing = (base: string, tiers: FeeTier[]): PricingConfig =>
  unwrap(
    PricingConfig.create({
      baseRate: unwrap(Money.fromDecimalString(base)),
      tiers,
    })
  )

/** The specification's own worked example: 2.00 a day, doubling then tripling. */
const STANDARD = pricing("2.00", [
  tier(1, 5, 1),
  tier(6, 10, 2),
  tier(11, null, 3),
])

describe("TieredDailyRateFeePolicy", () => {
  const policy = new TieredDailyRateFeePolicy()

  const feeFor = (days: number, config = STANDARD): string =>
    policy.calculate(stay(days), config).toDecimalString()

  describe("the worked example", () => {
    it.each([
      ["one day", 1, "2.00"],
      ["the last day of the first band", 5, "10.00"],
      ["the first day of the second band", 6, "14.00"],
      ["the last day of the second band", 10, "30.00"],
      ["the first day of the third band", 11, "36.00"],
      ["twenty days", 20, "90.00"],
    ])("charges %s as %s", (_label, days, expected) => {
      expect(feeFor(days)).toBe(expected)
    })

    it("charges a seven-day stay piecewise, at 9x base and not 14x", () => {
      // The differentiator. Seven days is 5·1·2 + 2·2·2 = 18.00, accumulated
      // band by band. Reading the rule as "apply the highest band reached to
      // the whole stay" gives 7·2·2 = 28.00, which is the common wrong answer.
      expect(feeFor(7)).toBe("18.00")
    })
  })

  describe("pricing that is data, not code", () => {
    it("gives a grace period when the first band is free", () => {
      // Resolves the specification's own contradiction without a code change:
      // the grace period is just a leading tier with a zero multiplier.
      const withGrace = pricing("2.00", [tier(1, 2, 0), tier(3, null, 1)])

      expect(feeFor(1, withGrace)).toBe("0.00")
      expect(feeFor(2, withGrace)).toBe("0.00")
      expect(feeFor(3, withGrace)).toBe("2.00")
      expect(feeFor(4, withGrace)).toBe("4.00")
    })

    it("charges a flat rate when there is one unbounded band", () => {
      const flat = pricing("2.00", [tier(1, null, 1)])

      expect(feeFor(1, flat)).toBe("2.00")
      expect(feeFor(100, flat)).toBe("200.00")
    })

    it("charges nothing when the base rate is nothing", () => {
      const free = pricing("0.00", [tier(1, null, 3)])

      expect(feeFor(50, free)).toBe("0.00")
    })

    it("handles a fractional multiplier without losing a cent", () => {
      const halfPrice = pricing("2.00", [tier(1, 2, 1), tier(3, null, 0.5)])

      // 2 days at 2.00, then 2 days at 1.00.
      expect(feeFor(4, halfPrice)).toBe("6.00")
    })

    it("rounds half up once, on the total, not once per band", () => {
      // 1 day at x0.5 of 0.05 is 0.025. Rounding per band would charge 0.03
      // and then keep charging it; rounding the total charges 0.05 for two.
      const oddRate = pricing("0.05", [tier(1, null, 0.5)])

      expect(feeFor(1, oddRate)).toBe("0.03")
      expect(feeFor(2, oddRate)).toBe("0.05")
    })
  })

  describe("exactness", () => {
    it("stays exact where a float would drift", () => {
      const tenCents = pricing("0.10", [tier(1, null, 1)])

      expect(feeFor(3, tenCents)).toBe("0.30")
    })

    it("returns Money, never a number", () => {
      const fee = policy.calculate(stay(3), STANDARD)

      expect(fee).toBeInstanceOf(Money)
      expect(fee.toMinorUnits()).toBe(600)
    })

    it("never returns a negative fee", () => {
      expect(
        policy.calculate(stay(1), STANDARD).toMinorUnits()
      ).toBeGreaterThanOrEqual(0)
    })
  })
})
