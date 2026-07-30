import {
  PICKUP_CODE_ALPHABET,
  PICKUP_CODE_LENGTH,
} from "@domain/utils/pickup-code"

import { RandomPickupCodeGenerator } from "./random-pickup-code-generator"

describe("RandomPickupCodeGenerator", () => {
  const generator = new RandomPickupCodeGenerator()

  it("only ever produces codes the value object accepts", () => {
    // The alphabet excludes 0, 1, I, L, O and U, and a generator that drew from
    // a wider one would issue codes a customer's typo could never match.
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

    // 2400 draws over 30 symbols: anything much short of the whole alphabet means
    // the draw is skewed — a modulo over a wider random, or a fixed seed.
    expect(seen.size).toBe(PICKUP_CODE_ALPHABET.length)
  })

  it("does not hand out the same code every time", () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generator.generate().toString())
    )

    expect(codes.size).toBe(100)
  })
})
