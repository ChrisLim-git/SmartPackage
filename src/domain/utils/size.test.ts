import { isErr, type Result } from "../shared/result"
import { LockerSize, PackageSize, Size } from "./size"

const unwrap = <T>(result: Result<T, { message: string }>): T => {
  if (isErr(result)) {
    throw new Error(`test setup failed: ${result.error.message}`)
  }
  return result.value
}

/** Fixtures built here, not imported: sizes are master data rows, not domain constants. */
const lockerSize = (code: string, rank: number): LockerSize =>
  unwrap(LockerSize.create({ code, rank, label: `${code} locker` }))

const packageSize = (code: string, rank: number): PackageSize =>
  unwrap(PackageSize.create({ code, rank, label: `${code} package` }))

describe("Size", () => {
  const small = lockerSize("S", 1)
  const medium = lockerSize("M", 2)
  const large = lockerSize("L", 3)

  describe("ordering", () => {
    it("ranks small below medium below large", () => {
      expect(small.isSmallerThan(medium)).toBe(true)
      expect(medium.isSmallerThan(large)).toBe(true)
      expect(large.isSmallerThan(small)).toBe(false)
    })

    it("answers isAtLeast against a smaller size", () => {
      expect(medium.isAtLeast(small)).toBe(true)
      expect(small.isAtLeast(medium)).toBe(false)
    })

    it("counts a size as at least itself", () => {
      expect(medium.isAtLeast(medium)).toBe(true)
      expect(medium.isAtLeast(lockerSize("M", 2))).toBe(true)
    })

    it("sorts a shuffled list into ascending rank", () => {
      const shuffled = [large, small, medium]

      const sorted = [...shuffled].sort(Size.byRank)

      expect(sorted.map((size) => size.code)).toEqual(["S", "M", "L"])
    })
  })

  describe("equality", () => {
    it("compares by code and rank rather than identity", () => {
      expect(medium.equals(lockerSize("M", 2))).toBe(true)
      expect(medium.equals(lockerSize("M", 5))).toBe(false)
      expect(medium.equals(lockerSize("MEDIUM", 2))).toBe(false)
    })
  })

  describe("construction", () => {
    it("rejects a rank that is not positive", () => {
      expect(isErr(LockerSize.create({ code: "S", rank: 0, label: "S" }))).toBe(
        true
      )
      expect(
        isErr(LockerSize.create({ code: "S", rank: -1, label: "S" }))
      ).toBe(true)
    })

    it("rejects a rank that is not a whole number", () => {
      expect(
        isErr(LockerSize.create({ code: "S", rank: 1.5, label: "S" }))
      ).toBe(true)
    })

    it("rejects a code that is empty or only spaces", () => {
      expect(isErr(LockerSize.create({ code: "", rank: 1, label: "S" }))).toBe(
        true
      )
      expect(
        isErr(LockerSize.create({ code: "   ", rank: 1, label: "S" }))
      ).toBe(true)
    })

    it("rejects an empty label — it is what a person reads on the screen", () => {
      expect(isErr(LockerSize.create({ code: "S", rank: 1, label: "" }))).toBe(
        true
      )
    })
  })

  describe("extensibility", () => {
    it("takes a fourth size with no change to production code", () => {
      const extraLarge = lockerSize("XL", 4)

      expect(extraLarge.isAtLeast(large)).toBe(true)
      expect(large.isSmallerThan(extraLarge)).toBe(true)
      expect(
        [large, extraLarge, small].sort(Size.byRank).map((size) => size.code)
      ).toEqual(["S", "L", "XL"])
    })
  })

  describe("the two kinds are not interchangeable", () => {
    it("keeps a locker's capacity and a package's requirement apart", () => {
      const requirement = packageSize("M", 2)

      // Compile-time assertion: if these ever become assignable, the unused
      // suppression below itself fails typecheck. (Do not start that sentence
      // with the directive name — TypeScript reads any comment beginning with
      // it as a second directive, which is then unused, which fails the build.)
      // @ts-expect-error a PackageSize is not a LockerSize
      const capacity: LockerSize = requirement

      expect(capacity.rank).toBe(requirement.rank)
    })
  })
})
