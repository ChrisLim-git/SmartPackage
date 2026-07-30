import { StubPickupCodeGenerator } from "@/utils/stub-pickup-code-generator"

import { isErr, type Result } from "../shared/result"
import { PickupCode } from "./pickup-code"

const unwrap = <T>(result: Result<T, { message: string }>): T => {
  if (isErr(result)) {
    throw new Error(`test setup failed: ${result.error.message}`)
  }
  return result.value
}

const code = (value: string): PickupCode => unwrap(PickupCode.create(value))

describe("PickupCode", () => {
  it("accepts six digits", () => {
    expect(code("123456").toString()).toBe("123456")
  })

  it("keeps leading zeros — a code is a string, never a number", () => {
    // The sneaky one. Anything that parses the code as a number turns
    // "000123" into 123 and the locker never opens.
    expect(code("000123").toString()).toBe("000123")
    expect(code("000123").equals(code("000123"))).toBe(true)
    expect(code("000123").toString()).not.toBe("123")
  })

  it("rejects anything that is not exactly six characters", () => {
    expect(isErr(PickupCode.create("12345"))).toBe(true)
    expect(isErr(PickupCode.create("1234567"))).toBe(true)
    expect(isErr(PickupCode.create(""))).toBe(true)
  })

  it("rejects anything that is not a digit", () => {
    for (const value of ["12345a", "12 456", "12-456", "12.456", "①②③④⑤⑥"]) {
      expect(isErr(PickupCode.create(value))).toBe(true)
    }
  })

  it("reports a malformed code as a Result rather than throwing", () => {
    const result = PickupCode.create("nope")

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe("MalformedInput")
  })

  it("compares by value, not by identity", () => {
    expect(code("123456").equals(code("123456"))).toBe(true)
    expect(code("123456").equals(code("654321"))).toBe(false)
  })
})

describe("StubPickupCodeGenerator", () => {
  it("hands out the queued codes in order", () => {
    const generator = new StubPickupCodeGenerator(["111111", "222222"])

    expect(generator.generate().toString()).toBe("111111")
    expect(generator.generate().toString()).toBe("222222")
  })

  it("throws once the queue is exhausted rather than repeating itself", () => {
    // A test that outruns its stub has stopped testing what it says it
    // tests. Failing loudly is the only useful behaviour here.
    const generator = new StubPickupCodeGenerator(["111111"])
    generator.generate()

    expect(() => generator.generate()).toThrow(/exhausted/i)
  })
})
