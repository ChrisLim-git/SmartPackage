import type { Locker } from "@domain/entities/locker"
import type { Station } from "@domain/entities/station"
import type { PricingConfig } from "@domain/utils/pricing-config"
import type { LockerSize } from "@domain/utils/size"

/**
 * What crosses the wire.
 *
 * Entities are not serialised directly. A `Money` handed to `JSON.stringify`
 * becomes whatever its private field happens to be, and a value object's shape
 * would become an API contract by accident — one rename away from breaking a
 * client. These types are the contract, written down.
 */

export type StationDto = {
  id: string
  name: string
  address: string
}

export type LockerSizeDto = {
  code: string
  rank: number
  label: string
}

export type LockerDto = {
  id: string
  stationId: string
  label: string
  status: "available" | "occupied"
  size: LockerSizeDto
}

export type FeeTierDto = {
  fromDay: number
  /** `null` is the unbounded band — every day past the end of the table. */
  toDay: number | null
  /** `"1.50"`, not `1.5`: a multiplier is a decimal, and decimals travel as strings here. */
  multiplier: string
}

export type PricingDto = {
  /** `"2.00"` — a string, deliberately, so no client can float it back. */
  baseRatePerDay: string
  tiers: FeeTierDto[]
}

export const toStationDto = (station: Station): StationDto => ({
  id: station.id,
  name: station.name,
  address: station.address,
})

export const toLockerSizeDto = (size: LockerSize): LockerSizeDto => ({
  code: size.code,
  rank: size.rank,
  label: size.label,
})

export const toLockerDto = (locker: Locker): LockerDto => ({
  id: locker.id,
  stationId: locker.stationId,
  label: locker.label,
  status: locker.isAvailable() ? "available" : "occupied",
  size: toLockerSizeDto(locker.size),
})

/** Hundredths back to a two-decimal string: 150 is `"1.50"`, and no float is involved. */
const multiplierToString = (hundredths: number): string => {
  const digits = String(hundredths).padStart(3, "0")
  const boundary = digits.length - 2

  return `${digits.slice(0, boundary)}.${digits.slice(boundary)}`
}

export const toPricingDto = (config: PricingConfig): PricingDto => ({
  baseRatePerDay: config.baseRate.toDecimalString(),
  tiers: config.tiers.map((tier) => ({
    fromDay: tier.fromDay,
    toDay: tier.toDay,
    multiplier: multiplierToString(tier.multiplierHundredths),
  })),
})
