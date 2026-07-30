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
  /** The rate and the boundary, so the total on screen can be read back. */
  dailyRate: string
  firstTierEndsOnDay: number | null
  retrievedAt: string
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
  dailyRate: collected.baseRate.toDecimalString(),
  firstTierEndsOnDay: collected.firstTierEndsOnDay,
  retrievedAt: collected.retrievedAt.toISOString(),
})
