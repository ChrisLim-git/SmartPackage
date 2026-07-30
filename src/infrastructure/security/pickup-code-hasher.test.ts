import { PickupCode } from "@domain/utils/pickup-code"

import { HmacPickupCodeHasher } from "./pickup-code-hasher"

const code = (value: string): PickupCode => {
  const result = PickupCode.create(value)
  if (result.kind === "err") throw new Error(result.error.message)
  return result.value
}

const hasher = new HmacPickupCodeHasher("test-pepper")

describe("HmacPickupCodeHasher", () => {
  it("produces the same hash for the same code every time", () => {
    expect(hasher.hash(code("123456"))).toBe(hasher.hash(code("123456")))
  })

  it("produces a different hash for a different code", () => {
    expect(hasher.hash(code("123456"))).not.toBe(hasher.hash(code("123457")))
  })

  it("matches the code it was made from", () => {
    const stored = hasher.hash(code("123456"))

    expect(hasher.matches(code("123456"), stored)).toBe(true)
    expect(hasher.matches(code("654321"), stored)).toBe(false)
  })

  it("never lets the plaintext be read back out of the hash", () => {
    const stored = hasher.hash(code("000123"))

    expect(stored).not.toContain("000123")
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
  })

  it("needs the pepper as well as the stored hash", () => {
    // Six digits is a million possibilities: a plain digest in a stolen
    // database is brute-forced in seconds. The pepper is what stops a
    // database read from being a master key to every locker.
    const stored = hasher.hash(code("123456"))

    expect(
      new HmacPickupCodeHasher("other-pepper").hash(code("123456"))
    ).not.toBe(stored)
    expect(
      new HmacPickupCodeHasher("other-pepper").matches(code("123456"), stored)
    ).toBe(false)
  })

  it("rejects a stored value of the wrong shape instead of throwing", () => {
    // `timingSafeEqual` throws on a length mismatch, and a route handler that
    // crashes on a corrupt row tells an attacker something.
    expect(hasher.matches(code("123456"), "")).toBe(false)
    expect(hasher.matches(code("123456"), "deadbeef")).toBe(false)
    expect(hasher.matches(code("123456"), "not-hex".repeat(10))).toBe(false)
  })

  it("refuses to be built without a pepper", () => {
    expect(() => new HmacPickupCodeHasher("")).toThrow(/pepper/i)
  })
})
