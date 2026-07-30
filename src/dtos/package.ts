import type { StoredPackage } from "@domain/services/store-package-service"
import type { RetrievedPackage } from "@domain/services/retrieve-package-service"

/**
 * What the two flows send back.
 *
 * Money crosses as a fixed two-decimal **string**, never a number: `18.00`
 * parsed as a float and re-serialised is the one bug the whole money rule exists
 * to prevent, and a client that receives a string cannot reintroduce it by
 * accident.
 *
 * Dates cross as ISO 8601 in UTC, for the same reason — a `Date` handed to
 * `JSON.stringify` is already a string, but saying so here makes it a contract
 * rather than a coincidence.
 */
export type StoredPackageDto = {
  lockerLabel: string
  /** Plaintext, in this response only. After this the system holds a hash. */
  pickupCode: string
  storedAt: string
}

export type CollectedPackageDto = {
  packageId: string
  lockerLabel: string
  fee: string
  chargeableDays: number
  retrievedAt: string
  /**
   * What the kiosk scanner reads to open the door.
   *
   * The collection is already recorded by the time this exists — the parcel is
   * marked collected and the locker released in one transaction — so this is the
   * handoff to hardware, not a second authorisation. Physically opening a door is
   * out of scope for this system; encoding the locker and the parcel is where its
   * responsibility ends.
   */
  unlockUri: string
}

export const toStoredPackageDto = (
  stored: StoredPackage
): StoredPackageDto => ({
  lockerLabel: stored.lockerLabel,
  pickupCode: stored.pickupCode,
  storedAt: stored.storedAt.toISOString(),
})

export const toCollectedPackageDto = (
  collected: RetrievedPackage
): CollectedPackageDto => ({
  packageId: collected.packageId,
  lockerLabel: collected.lockerLabel,
  fee: collected.fee.toDecimalString(),
  chargeableDays: collected.chargeableDays,
  retrievedAt: collected.retrievedAt.toISOString(),
  unlockUri: `smartpackage://unlock?locker=${encodeURIComponent(
    collected.lockerLabel
  )}&package=${collected.packageId}`,
})
