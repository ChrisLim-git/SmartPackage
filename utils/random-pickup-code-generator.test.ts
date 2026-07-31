import {
  PICKUP_CODE_ALPHABET,
  PICKUP_CODE_LENGTH,
} from "@domain/utils/pickup-code"

import { RandomPickupCodeGenerator } from "./random-pickup-code-generator"

describe("RandomPickupCodeGenerator", () => {
  const generator = new RandomPickupCodeGenerator()

  it("only ever produces codes the value object accepts", () => {
    // The alphabet excludes 0, 1, I, L, O and U; a wider draw would issue unmatchable codes.
    const allowed = new RegExp(
      `^[${PICKUP_CODE_ALPHABET}]{${PICKUP_CODE_LENGTH}}$`
    )

    for (let attempt = 0; attempt < 500; attempt += 1) {
      expect(generator.generate().toString()).toMatch(allowed)
    }
  })

  it("reaches most of the alphabet rather than a corner of it", () => {
    const seen = new Set(
      Array.from({ length: 400 }, () => generator.generate().toString()).join(
        ""
      )
    )

    // 2400 draws over 30 symbols: short of the whole alphabet means a skewed draw.
    expect(seen.size).toBe(PICKUP_CODE_ALPHABET.length)
  })

  it("does not hand out the same code every time", () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generator.generate().toString())
    )

    expect(codes.size).toBe(100)
  })
})
