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

/**
 * One band of the stay, at the rate that band charges.
 *
 * A rate and not a subtotal, matching the domain: the total is rounded once,
 * across every band, so per-band amounts would not add up to it.
 */
export type ChargedBandDto = {
  fromDay: number
  toDay: number
  days: number
  ratePerDay: string
}

export type CollectedPackageDto = {
  packageId: string
  lockerLabel: string
  fee: string
  chargeableDays: number
  /**
   * Every band the stay was charged at, so the total on screen can be read
   * back. Not a single `dailyRate`: a stay that crossed a tier boundary was
   * charged at more than one, and one number describing several states an
   * amount the total contradicts.
   */
  bands: ChargedBandDto[]
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
  bands: collected.bands.map((band) => ({
    fromDay: band.fromDay,
    toDay: band.toDay,
    days: band.days,
    ratePerDay: band.ratePerDay.toDecimalString(),
  })),
  retrievedAt: collected.retrievedAt.toISOString(),
})
