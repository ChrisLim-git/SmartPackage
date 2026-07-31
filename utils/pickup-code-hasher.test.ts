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
    expect(hasher.hash(code("H2K4M7"))).toBe(hasher.hash(code("H2K4M7")))
  })

  it("produces a different hash for a different code", () => {
    expect(hasher.hash(code("H2K4M7"))).not.toBe(hasher.hash(code("H2K4M8")))
  })

  it("matches the code it was made from", () => {
    const stored = hasher.hash(code("H2K4M7"))

    expect(hasher.matches(code("H2K4M7"), stored)).toBe(true)
    expect(hasher.matches(code("M7K4H2"), stored)).toBe(false)
  })

  it("never lets the plaintext be read back out of the hash", () => {
    const stored = hasher.hash(code("22H2K4"))

    expect(stored).not.toContain("22H2K4")
    expect(stored).not.toContain("22h2k4")
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
  })

  it("needs the pepper as well as the stored hash", () => {
    // The pepper is what stops a database read from being a master key.
    const stored = hasher.hash(code("H2K4M7"))

    expect(
      new HmacPickupCodeHasher("other-pepper").hash(code("H2K4M7"))
    ).not.toBe(stored)
    expect(
      new HmacPickupCodeHasher("other-pepper").matches(code("H2K4M7"), stored)
    ).toBe(false)
  })

  it("rejects a stored value of the wrong shape instead of throwing", () => {
    // `timingSafeEqual` throws on a length mismatch; a corrupt row must not crash the route.
    expect(hasher.matches(code("H2K4M7"), "")).toBe(false)
    expect(hasher.matches(code("H2K4M7"), "deadbeef")).toBe(false)
    expect(hasher.matches(code("H2K4M7"), "not-hex".repeat(10))).toBe(false)
  })

  it("refuses to be built without a pepper", () => {
    expect(() => new HmacPickupCodeHasher("")).toThrow(/pepper/i)
  })
})
