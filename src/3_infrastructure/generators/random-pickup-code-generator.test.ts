import { RandomPickupCodeGenerator } from "./random-pickup-code-generator"

describe("RandomPickupCodeGenerator", () => {
  const generator = new RandomPickupCodeGenerator()

  it("only ever produces codes the value object accepts", () => {
    // Including the ones starting with a zero, which is where a generator
    // built on a number rather than a string falls over.
    for (let attempt = 0; attempt < 500; attempt += 1) {
      expect(generator.generate().toString()).toMatch(/^\d{6}$/)
    }
  })

  it("does not hand out the same code every time", () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generator.generate().toString())
    )

    expect(codes.size).toBeGreaterThan(1)
  })
})
