import { StubPickupCodeGenerator } from "@/utils/stub-pickup-code-generator"

import { isErr, type Result } from "../shared/result"
import { PICKUP_CODE_ALPHABET, PickupCode } from "./pickup-code"

const unwrap = <T>(result: Result<T, { message: string }>): T => {
  if (isErr(result)) {
    throw new Error(`test setup failed: ${result.error.message}`)
  }
  return result.value
}

const code = (value: string): PickupCode => unwrap(PickupCode.create(value))

describe("PickupCode", () => {
  it("accepts six characters from the alphabet", () => {
    expect(code("K4M9PT").toString()).toBe("K4M9PT")
    expect(code("234567").toString()).toBe("234567")
    expect(code("ZYXWVT").toString()).toBe("ZYXWVT")
  })

  it("folds what a phone keyboard does to a typed code", () => {
    expect(code("k4m9pt").toString()).toBe("K4M9PT")
    expect(code(" K4M9PT ").toString()).toBe("K4M9PT")
    expect(code("k4m9pt").equals(code("K4M9PT"))).toBe(true)
  })

  it("stays a string, so nothing can parse it into a number", () => {
    expect(code("234567").toString()).toBe("234567")
    expect(typeof code("234567").toString()).toBe("string")
  })

  it("rejects the characters deliberately left out of the alphabet", () => {
    // Excluded characters are never issued, so never accepted; no remapping of O to 0.
    for (const value of [
      "K4M9P0",
      "K4M9PO",
      "K4M9P1",
      "K4M9PI",
      "K4M9PL",
      "K4M9PU",
    ]) {
      expect(isErr(PickupCode.create(value))).toBe(true)
    }

    for (const excluded of ["0", "1", "I", "L", "O", "U"]) {
      expect(PICKUP_CODE_ALPHABET).not.toContain(excluded)
    }
  })

  it("rejects anything that is not exactly six characters", () => {
    expect(isErr(PickupCode.create("K4M9P"))).toBe(true)
    expect(isErr(PickupCode.create("K4M9PTX"))).toBe(true)
    expect(isErr(PickupCode.create(""))).toBe(true)
  })

  it("rejects anything outside letters and digits", () => {
    for (const value of ["K4M9P!", "K4 M9P", "K4-M9P", "K4.M9P", "①②③④⑤⑥"]) {
      expect(isErr(PickupCode.create(value))).toBe(true)
    }
  })

  it("reports a malformed code as a Result rather than throwing", () => {
    const result = PickupCode.create("nope")

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe("MalformedInput")
  })

  it("compares by value, not by identity", () => {
    expect(code("K4M9PT").equals(code("K4M9PT"))).toBe(true)
    expect(code("K4M9PT").equals(code("TP9M4K"))).toBe(false)
  })
})

describe("StubPickupCodeGenerator", () => {
  it("hands out the queued codes in order", () => {
    const generator = new StubPickupCodeGenerator(["AAAAAA", "BBBBBB"])

    expect(generator.generate().toString()).toBe("AAAAAA")
    expect(generator.generate().toString()).toBe("BBBBBB")
  })

  it("throws once the queue is exhausted rather than repeating itself", () => {
    const generator = new StubPickupCodeGenerator(["AAAAAA"])
    generator.generate()

    expect(() => generator.generate()).toThrow(/exhausted/i)
  })
})
