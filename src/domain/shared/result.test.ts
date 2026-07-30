import { err, isErr, isOk, map, mapErr, ok, type Result, unwrapOr } from "./result"

describe("Result", () => {
  it("narrows to the carried value when the ok guard passes", () => {
    const result: Result<number, string> = ok(42)

    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
    // The guard is what makes this line compile — `result.value` does not
    // exist on the union.
    if (isOk(result)) expect(result.value).toBe(42)
  })

  it("narrows to the carried error when the err guard passes", () => {
    const result: Result<number, string> = err("boom")

    expect(isErr(result)).toBe(true)
    expect(isOk(result)).toBe(false)
    if (isErr(result)) expect(result.error).toBe("boom")
  })

  it("maps the value of an ok", () => {
    const result: Result<number, string> = ok(2)

    expect(map(result, (n) => n * 10)).toEqual(ok(20))
  })

  it("passes an err through map untouched", () => {
    const result: Result<number, string> = err("boom")

    expect(map(result, (n) => n * 10)).toEqual(err("boom"))
  })

  it("does not call the mapping function on an err", () => {
    const transform = jest.fn()

    map(err("boom") as Result<number, string>, transform)

    expect(transform).not.toHaveBeenCalled()
  })

  it("maps the error of an err", () => {
    const result: Result<number, string> = err("boom")

    expect(mapErr(result, (e) => e.toUpperCase())).toEqual(err("BOOM"))
  })

  it("passes an ok through mapErr untouched", () => {
    const result: Result<number, string> = ok(2)

    expect(mapErr(result, (e) => e.toUpperCase())).toEqual(ok(2))
  })

  it("unwraps the value of an ok and ignores the fallback", () => {
    const result: Result<number, string> = ok(2)

    expect(unwrapOr(result, 99)).toBe(2)
  })

  it("returns the fallback when unwrapping an err", () => {
    const result: Result<number, string> = err("boom")

    expect(unwrapOr(result, 99)).toBe(99)
  })
})
