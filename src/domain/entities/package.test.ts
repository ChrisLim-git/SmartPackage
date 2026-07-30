import { FixedClock } from "@/test/doubles/clocks"
import { FakePickupCodeHasher } from "@/test/doubles/fake-pickup-code-hasher"
import { unwrap } from "@/test/support/unwrap"

import { isErr } from "../shared/result"
import { Money } from "../utils/money"
import { PickupCode } from "../utils/pickup-code"
import { PackageSize } from "../utils/size"
import { Package } from "./package"

const SMALL = unwrap(PackageSize.create({ code: "S", rank: 1, label: "Small" }))
const CODE = unwrap(PickupCode.create("123456"))
const OTHER_CODE = unwrap(PickupCode.create("654321"))
const FEE = unwrap(Money.fromDecimalString("6.00"))

const STORED_AT = new Date("2026-01-01T09:00:00.000Z")
const RETRIEVED_AT = new Date("2026-01-03T09:00:00.000Z")

const hasher = new FakePickupCodeHasher()

const aStoredPackage = (code = CODE): Package =>
  unwrap(
    Package.store({
      id: "package-1",
      customerId: "customer-1",
      size: SMALL,
      lockerId: "locker-1",
      code,
      hasher,
      clock: new FixedClock(STORED_AT),
    })
  )

describe("Package", () => {
  describe("storing", () => {
    it("starts stored, uncollected and unbilled", () => {
      const parcel = aStoredPackage()

      expect(parcel.status).toBe("stored")
      expect(parcel.retrievedAt).toBeNull()
      expect(parcel.feeCharged).toBeNull()
      expect(parcel.lockerId).toBe("locker-1")
    })

    it("takes storedAt from the injected clock, never from ambient time", () => {
      // The fee for a seven-day stay has to be testable in a millisecond.
      expect(aStoredPackage().storedAt.toISOString()).toBe(
        STORED_AT.toISOString()
      )
    })

    it("keeps the pickup code hashed, never in plaintext", () => {
      const parcel = aStoredPackage()

      expect(parcel.pickupCodeHash).toBe(hasher.hash(CODE))
      expect(JSON.stringify(parcel)).not.toContain("123456")
    })

    it("rejects a package with no customer or no locker", () => {
      const attributes = {
        id: "package-1",
        customerId: "customer-1",
        size: SMALL,
        lockerId: "locker-1",
        code: CODE,
        hasher,
        clock: new FixedClock(STORED_AT),
      }

      expect(isErr(Package.store({ ...attributes, customerId: " " }))).toBe(
        true
      )
      expect(isErr(Package.store({ ...attributes, lockerId: "" }))).toBe(true)
    })
  })

  describe("verifying a collection attempt", () => {
    it("accepts the code it was stored with", () => {
      expect(aStoredPackage().verifyCode(CODE, hasher)).toBe(true)
    })

    it("rejects a wrong code", () => {
      expect(aStoredPackage().verifyCode(OTHER_CODE, hasher)).toBe(false)
    })

    it("rejects another package's perfectly valid code", () => {
      const mine = aStoredPackage(CODE)
      const theirs = aStoredPackage(OTHER_CODE)

      expect(mine.verifyCode(OTHER_CODE, hasher)).toBe(false)
      expect(theirs.verifyCode(CODE, hasher)).toBe(false)
    })

    it("knows which locker it is in", () => {
      // Right code, wrong locker is its own failure, checked separately even
      // though both flatten to the same response.
      expect(aStoredPackage().matchesLocker("locker-1")).toBe(true)
      expect(aStoredPackage().matchesLocker("locker-2")).toBe(false)
    })
  })

  describe("retrieving", () => {
    it("records when it was collected and what was charged", () => {
      const collected = unwrap(aStoredPackage().retrieve(RETRIEVED_AT, FEE))

      expect(collected.status).toBe("retrieved")
      expect(collected.retrievedAt?.toISOString()).toBe(
        RETRIEVED_AT.toISOString()
      )
      expect(collected.feeCharged?.toDecimalString()).toBe("6.00")
    })

    it("keeps storedAt, so the audit trail survives collection", () => {
      const collected = unwrap(aStoredPackage().retrieve(RETRIEVED_AT, FEE))

      expect(collected.storedAt.toISOString()).toBe(STORED_AT.toISOString())
    })

    it("returns a new package and leaves the stored one alone", () => {
      const stored = aStoredPackage()

      const collected = unwrap(stored.retrieve(RETRIEVED_AT, FEE))

      expect(collected).not.toBe(stored)
      expect(stored.status).toBe("stored")
      expect(stored.retrievedAt).toBeNull()
    })

    it("refuses a second collection — this is the replayed code", () => {
      const collected = unwrap(aStoredPackage().retrieve(RETRIEVED_AT, FEE))

      const again = collected.retrieve(RETRIEVED_AT, FEE)

      expect(isErr(again)).toBe(true)
      if (isErr(again)) {
        expect(again.error.code).toBe("PackageAlreadyRetrieved")
      }
      expect(collected.status).toBe("retrieved")
      expect(collected.feeCharged?.toDecimalString()).toBe("6.00")
    })

    it("refuses a collection dated before the storage", () => {
      const result = aStoredPackage().retrieve(
        new Date(STORED_AT.getTime() - 1),
        FEE
      )

      expect(isErr(result)).toBe(true)
    })
  })
})
