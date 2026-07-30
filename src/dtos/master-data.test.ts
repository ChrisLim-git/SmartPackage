import { FeeTier } from "@domain/utils/fee-tier"
import { Money } from "@domain/utils/money"
import { PricingConfig } from "@domain/utils/pricing-config"
import { isErr, type Result } from "@domain/shared/result"

import { toPricingDto } from "./master-data"

const must = <T>(result: Result<T, { message: string }>): T => {
  if (isErr(result)) throw new Error(result.error.message)

  return result.value
}

/**
 * Only the mapping that computes something.
 *
 * `toStationDto` and friends copy fields across and a test of them would assert
 * the assignment operator. `multiplierToString` is arithmetic on the boundary
 * where a float would be easiest to reach for, so it is the one worth pinning.
 */
describe("toPricingDto", () => {
  const pricingWith = (multiplierHundredths: number) =>
    must(
      PricingConfig.create({
        baseRate: must(Money.fromDecimalString("2.00")),
        tiers: [
          must(
            FeeTier.fromHundredths({
              fromDay: 1,
              toDay: null,
              multiplierHundredths,
            })
          ),
        ],
      })
    )

  it.each([
    [100, "1.00"],
    [150, "1.50"],
    [5, "0.05"],
    [50, "0.50"],
    [1000, "10.00"],
    [0, "0.00"],
  ])("renders %i hundredths as %s", (hundredths, expected) => {
    expect(toPricingDto(pricingWith(hundredths)).tiers[0].multiplier).toBe(
      expected
    )
  })

  it("hands every decimal across as a string, never as a number", () => {
    const dto = toPricingDto(pricingWith(150))

    // A client that receives `1.5` can float it back; a client that receives
    // `"1.50"` has to decide what to do, which is the point.
    expect(typeof dto.baseRatePerDay).toBe("string")
    expect(typeof dto.tiers[0].multiplier).toBe("string")
  })

  it("carries the unbounded band across as null", () => {
    expect(toPricingDto(pricingWith(100)).tiers[0].toDay).toBeNull()
  })
})
