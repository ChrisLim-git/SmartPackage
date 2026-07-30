import { createTestDb } from "@/test/support/test-db"

import { feeTier, pricingConfig } from "../schema/pricing"
import { DrizzlePricingRepository } from "./drizzle-pricing-repository"

const { pool, db } = createTestDb()

const repository = () => new DrizzlePricingRepository(db)

describe("DrizzlePricingRepository", () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM fee_tier")
    await pool.query("DELETE FROM pricing_config")
  })

  afterAll(async () => {
    await pool.query("DELETE FROM fee_tier")
    await pool.query("DELETE FROM pricing_config")
    await pool.end()
  })

  const seedPricing = async (
    tiers: (typeof feeTier.$inferInsert)[],
    baseRate = "2.00"
  ) => {
    await db
      .insert(pricingConfig)
      .values({ baseRatePerDay: baseRate, currencyCode: "AUD" })
    await db.insert(feeTier).values(tiers)
  }

  const CONTIGUOUS = [
    { fromDay: 1, toDay: 5, multiplierHundredths: 100 },
    { fromDay: 6, toDay: 10, multiplierHundredths: 200 },
    { fromDay: 11, toDay: null, multiplierHundredths: 300 },
  ]

  it("turns the numeric column into Money without going near a float", async () => {
    await seedPricing(CONTIGUOUS)

    const config = await repository().currentConfig()

    // 2.00 as 200 minor units, printed back exactly as it went in.
    expect(config.baseRate.toDecimalString()).toBe("2.00")
  })

  it("keeps a rate a float would lose", async () => {
    await seedPricing(CONTIGUOUS, "0.10")

    const config = await repository().currentConfig()

    // The classic case: 0.10 cannot be represented in binary floating point,
    // and three of them make 0.30000000000000004.
    const threeDays = config.baseRate
      .plus(config.baseRate)
      .plus(config.baseRate)
    expect(threeDays.toDecimalString()).toBe("0.30")
  })

  it("returns the tiers in order, with the unbounded band last", async () => {
    // Inserted deliberately out of order: ordering is the repository's job,
    // and row order from Postgres is not a promise.
    await seedPricing([...CONTIGUOUS].reverse())

    const config = await repository().currentConfig()

    expect(config.tiers.map((tier) => tier.fromDay)).toEqual([1, 6, 11])
    expect(config.tiers[config.tiers.length - 1].isUnbounded).toBe(true)
  })

  it("carries the multiplier across as the exact integer stored", async () => {
    await seedPricing([{ fromDay: 1, toDay: null, multiplierHundredths: 220 }])

    const config = await repository().currentConfig()

    // 2.2 is the multiplier that a float-based check rejects: 2.2 * 100 is
    // 220.00000000000003. Reading hundredths straight through never asks.
    expect(config.tiers[0].multiplierHundredths).toBe(220)
  })

  it("refuses a fee table with a gap rather than pricing a day at nothing", async () => {
    await seedPricing([
      { fromDay: 1, toDay: 5, multiplierHundredths: 100 },
      // Day 6 is charged by nothing at all.
      { fromDay: 7, toDay: null, multiplierHundredths: 300 },
    ])

    await expect(repository().currentConfig()).rejects.toThrow(
      /fee table is not usable/
    )
  })

  it("says what to do when nothing is configured", async () => {
    await expect(repository().currentConfig()).rejects.toThrow(/db:seed/)
  })
})
