import { unwrap } from "@/test/support/unwrap"

import type { LockerFitPolicy } from "../policies/locker-fit-policy"
import { isErr, isOk } from "../shared/result"
import { LockerSize, PackageSize } from "../value-objects/size"
import { Locker } from "./locker"

const MEDIUM = unwrap(
  LockerSize.create({ code: "M", rank: 2, label: "Medium" })
)
const SMALL_PACKAGE = unwrap(
  PackageSize.create({ code: "S", rank: 1, label: "Small" })
)
const LARGE_PACKAGE = unwrap(
  PackageSize.create({ code: "L", rank: 3, label: "Large" })
)

const aLocker = (): Locker =>
  unwrap(
    Locker.create({
      id: "locker-1",
      stationId: "station-1",
      size: MEDIUM,
      label: "A12",
    })
  )

/** Stands in for the real ordinal policy, which arrives with its own ticket. */
const rankFit: LockerFitPolicy = {
  fits: (capacity, requirement) => capacity.rank >= requirement.rank,
}

describe("Locker", () => {
  describe("creation", () => {
    it("starts available and empty", () => {
      const locker = aLocker()

      expect(locker.status).toBe("available")
      expect(locker.isAvailable()).toBe(true)
      expect(locker.currentPackageId).toBeNull()
    })

    it("rejects a label that is empty or only whitespace", () => {
      for (const label of ["", "   "]) {
        expect(
          isErr(
            Locker.create({
              id: "locker-1",
              stationId: "station-1",
              size: MEDIUM,
              label,
            })
          )
        ).toBe(true)
      }
    })
  })

  describe("occupying", () => {
    it("holds the package and reports itself occupied", () => {
      const occupied = unwrap(aLocker().occupy("package-1"))

      expect(occupied.status).toBe("occupied")
      expect(occupied.isAvailable()).toBe(false)
      expect(occupied.currentPackageId).toBe("package-1")
    })

    it("returns a new locker and leaves the original alone", () => {
      // The transition is a value, not a mutation. A shared mutable locker
      // would swallow a double-book inside JavaScript object state, where the
      // concurrency test can never see it.
      const available = aLocker()

      const occupied = unwrap(available.occupy("package-1"))

      expect(occupied).not.toBe(available)
      expect(available.status).toBe("available")
      expect(available.currentPackageId).toBeNull()
    })

    it("refuses a locker that already holds something", () => {
      const occupied = unwrap(aLocker().occupy("package-1"))

      const second = occupied.occupy("package-2")

      expect(isErr(second)).toBe(true)
      if (isErr(second)) {
        expect(second.error.code).toBe("LockerAlreadyOccupied")
        expect(second.error.lockerId).toBe("locker-1")
      }
      expect(occupied.currentPackageId).toBe("package-1")
    })

    it("refuses even the package it already holds", () => {
      // Quietly succeeding here would turn a double-store bug into a silent
      // success and leave the first package unaccounted for.
      const occupied = unwrap(aLocker().occupy("package-1"))

      expect(isErr(occupied.occupy("package-1"))).toBe(true)
    })
  })

  describe("releasing", () => {
    it("empties the locker and makes it available again", () => {
      const occupied = unwrap(aLocker().occupy("package-1"))

      const released = unwrap(occupied.release())

      expect(released.status).toBe("available")
      expect(released.isAvailable()).toBe(true)
      expect(released.currentPackageId).toBeNull()
    })

    it("refuses an empty locker", () => {
      const result = aLocker().release()

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe("LockerNotOccupied")
    })

    it("leaves the occupied locker untouched", () => {
      const occupied = unwrap(aLocker().occupy("package-1"))

      unwrap(occupied.release())

      expect(occupied.currentPackageId).toBe("package-1")
    })

    it("can be occupied again after release — the whole point of a locker", () => {
      const first = unwrap(aLocker().occupy("package-1"))
      const emptied = unwrap(first.release())

      const second = emptied.occupy("package-2")

      expect(isOk(second)).toBe(true)
      if (isOk(second)) expect(second.value.currentPackageId).toBe("package-2")
    })
  })

  describe("capacity", () => {
    it("asks the fit policy rather than comparing sizes itself", () => {
      const locker = aLocker()

      expect(locker.canAccommodate(SMALL_PACKAGE, rankFit)).toBe(true)
      expect(locker.canAccommodate(LARGE_PACKAGE, rankFit)).toBe(false)
    })

    it("answers on capacity alone, not on whether it is free", () => {
      // Capacity and availability are different questions; the selection
      // policy is what combines them.
      const occupied = unwrap(aLocker().occupy("package-1"))

      expect(occupied.canAccommodate(SMALL_PACKAGE, rankFit)).toBe(true)
    })

    it("takes a different policy without changing", () => {
      // Strategy, demonstrated: dimensional fit can replace ordinal fit and
      // the entity does not change.
      const nothingFits: LockerFitPolicy = { fits: () => false }

      expect(aLocker().canAccommodate(SMALL_PACKAGE, nothingFits)).toBe(false)
    })
  })
})
