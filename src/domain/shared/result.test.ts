import {
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  type Result,
  unwrapOr,
} from "./result"

/**
 * Helpers keep the declared type the union; a narrowed literal would leave
 * `map` nothing to infer `T` from.
 */
const okResult = (value: number): Result<number, string> => ok(value)
const errResult = (error: string): Result<number, string> => err(error)

describe("Result", () => {
  it("narrows to the carried value when the ok guard passes", () => {
    const result = okResult(42)

    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
    if (isOk(result)) expect(result.value).toBe(42)
  })

  it("narrows to the carried error when the err guard passes", () => {
    const result = errResult("boom")

    expect(isErr(result)).toBe(true)
    expect(isOk(result)).toBe(false)
    if (isErr(result)) expect(result.error).toBe("boom")
  })

  it("maps the value of an ok", () => {
    expect(map(okResult(2), (n) => n * 10)).toEqual(ok(20))
  })

  it("passes an err through map untouched", () => {
    expect(map(errResult("boom"), (n) => n * 10)).toEqual(err("boom"))
  })

  it("does not call the mapping function on an err", () => {
    // Counter, not `jest.fn()`: the ESM suite has no `jest` global.
    let calls = 0

    map(errResult("boom"), (n) => {
      calls += 1
      return n
    })

    expect(calls).toBe(0)
  })

  it("maps the error of an err", () => {
    expect(mapErr(errResult("boom"), (e) => e.toUpperCase())).toEqual(
      err("BOOM")
    )
  })

  it("passes an ok through mapErr untouched", () => {
    expect(mapErr(okResult(2), (e) => e.toUpperCase())).toEqual(ok(2))
  })

  it("unwraps the value of an ok and ignores the fallback", () => {
    expect(unwrapOr(okResult(2), 99)).toBe(2)
  })

  it("returns the fallback when unwrapping an err", () => {
    expect(unwrapOr(errResult("boom"), 99)).toBe(99)
  })
})
