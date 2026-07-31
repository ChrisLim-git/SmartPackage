import { unwrap } from "@/utils/unwrap"

import { Money } from "../utils/money"
import { FeeTier } from "../utils/fee-tier"
import { PricingConfig } from "../utils/pricing-config"
import { StorageDuration } from "../utils/storage-duration"
import { TieredDailyRateFeeService } from "./tiered-daily-rate-fee-service"

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

describe("TieredDailyRateFeeService", () => {
  const service = new TieredDailyRateFeeService()

  const feeFor = (days: number, config = STANDARD): string =>
    service.calculate(stay(days), config).total.toDecimalString()

  /** The bands a stay actually touched, flattened to something readable. */
  const bandsFor = (days: number, config = STANDARD) =>
    service.calculate(stay(days), config).bands.map((band) => ({
      fromDay: band.fromDay,
      toDay: band.toDay,
      days: band.days,
      ratePerDay: band.ratePerDay.toDecimalString(),
    }))

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
      // Piecewise: 5·1·2 + 2·2·2 = 18.00; the highest band applied to the
      // whole stay would give 28.00.
      expect(feeFor(7)).toBe("18.00")
    })
  })

  describe("pricing that is data, not code", () => {
    it("gives a grace period when the first band is free", () => {
      // A grace period is just a leading tier with a zero multiplier.
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
      // 1 day at x0.5 of 0.05 is 0.025; the total rounds once, not per band.
      const oddRate = pricing("0.05", [tier(1, null, 0.5)])

      expect(feeFor(1, oddRate)).toBe("0.03")
      expect(feeFor(2, oddRate)).toBe("0.05")
    })
  })

  /** Bands must be reported: a stay crossing a boundary was charged at more than one rate. */
  describe("the bands a stay was charged at", () => {
    it("names each band the stay reached, with the rate that band charges", () => {
      expect(bandsFor(7)).toEqual([
        { fromDay: 1, toDay: 5, days: 5, ratePerDay: "2.00" },
        { fromDay: 6, toDay: 7, days: 2, ratePerDay: "4.00" },
      ])
    })

    it("reconciles: the bands multiply out to the total that is charged", () => {
      // The property that matters. Whatever the configuration, a customer
      // adding up what they were shown must reach what they were charged.
      const bands = bandsFor(7)
      const summed = bands.reduce(
        (total, band) => total + Number(band.ratePerDay) * band.days,
        0
      )

      expect(summed.toFixed(2)).toBe(feeFor(7))
    })

    it("leaves out bands the stay never reached", () => {
      // A two-day stay has no business being told what day eleven would cost.
      expect(bandsFor(2)).toHaveLength(1)
    })

    it("ends the unbounded band on the last day charged, not on infinity", () => {
      const [, , last] = bandsFor(12)

      expect(last).toEqual({
        fromDay: 11,
        toDay: 12,
        days: 2,
        ratePerDay: "6.00",
      })
    })

    it("collapses to one band for a stay inside the first one", () => {
      expect(bandsFor(1)).toEqual([
        { fromDay: 1, toDay: 1, days: 1, ratePerDay: "2.00" },
      ])
    })

    it("shows a grace period as the free band it is", () => {
      // The case that made this necessary. Reported as a single rate and a
      // boundary, a grace configuration claims charging began on day one at
      // the base rate, when the first two days were free.
      const withGrace = pricing("2.00", [tier(1, 2, 0), tier(3, null, 1)])

      expect(bandsFor(3, withGrace)).toEqual([
        { fromDay: 1, toDay: 2, days: 2, ratePerDay: "0.00" },
        { fromDay: 3, toDay: 3, days: 1, ratePerDay: "2.00" },
      ])
    })

    it("still rounds the total once, however the bands display", () => {
      // A per-band *rate* is shown; a per-band *subtotal* is not, because
      // rounding each band would collect up to half a cent per band. The rate
      // rounds for display and the total is unaffected by it.
      const oddRate = pricing("0.05", [tier(1, null, 0.5)])

      expect(bandsFor(2, oddRate)).toEqual([
        { fromDay: 1, toDay: 2, days: 2, ratePerDay: "0.03" },
      ])
      // 0.03 x 2 would be 0.06. The charge is 0.05.
      expect(feeFor(2, oddRate)).toBe("0.05")
    })
  })

  describe("exactness", () => {
    it("stays exact where a float would drift", () => {
      const tenCents = pricing("0.10", [tier(1, null, 1)])

      expect(feeFor(3, tenCents)).toBe("0.30")
    })

    it("returns Money, never a number", () => {
      const { total } = service.calculate(stay(3), STANDARD)

      expect(total).toBeInstanceOf(Money)
      expect(total.toMinorUnits()).toBe(600)
    })

    it("never returns a negative fee", () => {
      expect(
        service.calculate(stay(1), STANDARD).total.toMinorUnits()
      ).toBeGreaterThanOrEqual(0)
    })
  })
})
