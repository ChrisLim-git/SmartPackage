import { unwrap } from "@/test/support/unwrap"

import { isErr } from "../shared/result"
import { FeeTier } from "./fee-tier"
import { Money } from "./money"
import { PricingConfig } from "./pricing-config"

const tier = (fromDay: number, toDay: number | null, multiplier: number) =>
  unwrap(FeeTier.create({ fromDay, toDay, multiplier }))

const baseRate = unwrap(Money.fromDecimalString("2.00"))

const configure = (tiers: FeeTier[]) =>
  PricingConfig.create({ baseRate, tiers })

describe("FeeTier", () => {
  it("rejects a band that starts before day one", () => {
    expect(isErr(FeeTier.create({ fromDay: 0, toDay: 5, multiplier: 1 }))).toBe(
      true
    )
  })

  it("rejects a band that ends before it starts", () => {
    expect(isErr(FeeTier.create({ fromDay: 5, toDay: 4, multiplier: 1 }))).toBe(
      true
    )
  })

  it("rejects a negative multiplier — storage cannot pay the customer", () => {
    expect(
      isErr(FeeTier.create({ fromDay: 1, toDay: null, multiplier: -1 }))
    ).toBe(true)
  })

  it("rejects a multiplier finer than the money it multiplies", () => {
    // Two decimal places, like the currency. More would need a rounding rule
    // nobody has stated.
    expect(
      isErr(FeeTier.create({ fromDay: 1, toDay: null, multiplier: 1.005 }))
    ).toBe(true)
  })

  it("rejects fractional day boundaries", () => {
    expect(
      isErr(FeeTier.create({ fromDay: 1.5, toDay: 5, multiplier: 1 }))
    ).toBe(true)
  })
})

describe("PricingConfig", () => {
  it("accepts contiguous bands that start at day one and end unbounded", () => {
    const config = configure([tier(1, 5, 1), tier(6, 10, 2), tier(11, null, 3)])

    expect(isErr(config)).toBe(false)
  })

  it("rejects a gap between bands — a day with no rate is a silent revenue hole", () => {
    expect(isErr(configure([tier(1, 5, 1), tier(7, null, 2)]))).toBe(true)
  })

  it("rejects overlapping bands — a day with two rates has no answer", () => {
    expect(isErr(configure([tier(1, 5, 1), tier(4, null, 2)]))).toBe(true)
  })

  it("rejects a tier set that does not start at day one", () => {
    expect(isErr(configure([tier(2, null, 1)]))).toBe(true)
  })

  it("rejects a tier set with no unbounded band", () => {
    // Otherwise a long enough stay falls off the end of the table and is free.
    expect(isErr(configure([tier(1, 5, 1), tier(6, 10, 2)]))).toBe(true)
  })

  it("rejects an unbounded band that is not last", () => {
    expect(isErr(configure([tier(1, null, 1), tier(6, 10, 2)]))).toBe(true)
  })

  it("rejects more than one unbounded band", () => {
    expect(isErr(configure([tier(1, null, 1), tier(2, null, 2)]))).toBe(true)
  })

  it("rejects an empty tier set", () => {
    expect(isErr(configure([]))).toBe(true)
  })

  it("rejects unsorted input rather than quietly reordering it", () => {
    // Reordering would mean the configuration a person reads is not the
    // configuration that charges them.
    expect(isErr(configure([tier(6, 10, 2), tier(1, 5, 1)]))).toBe(true)
  })
})
