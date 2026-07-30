/**
 * The domain's failure taxonomy: a discriminated union on `code`, carried by
 * the `Err` side of a `Result`.
 *
 * These are plain data, not `Error` subclasses. Data compares by structure, so
 * a test asserts `toEqual(lockerAlreadyOccupied(id))` instead of matching a
 * message; messages stay free to change without breaking tests, and one mapper
 * at the HTTP edge turns a `code` into a status without a chain of
 * `instanceof`.
 */

export type DomainErrorCode = DomainError["code"]

export type NoSuitableLockerAvailable = {
  readonly code: "NoSuitableLockerAvailable"
  readonly stationId: string
  readonly message: string
}

export type LockerAlreadyOccupied = {
  readonly code: "LockerAlreadyOccupied"
  readonly lockerId: string
  readonly message: string
}

export type LockerNotOccupied = {
  readonly code: "LockerNotOccupied"
  readonly lockerId: string
  readonly message: string
}

/**
 * The single code for all five of the specification's invalid-pickup
 * scenarios. It carries no context on purpose — see `invalidPickupRequest`.
 */
export type InvalidPickupRequest = {
  readonly code: "InvalidPickupRequest"
  readonly message: string
}

export type PackageAlreadyRetrieved = {
  readonly code: "PackageAlreadyRetrieved"
  readonly packageId: string
  readonly message: string
}

export type MalformedInput = {
  readonly code: "MalformedInput"
  readonly field: string
  readonly reason: string
  readonly message: string
}

export type StationNotFound = {
  readonly code: "StationNotFound"
  readonly stationId: string
  readonly message: string
}

export type CustomerNotFound = {
  readonly code: "CustomerNotFound"
  readonly customerId: string
  readonly message: string
}

export type DomainError =
  | NoSuitableLockerAvailable
  | LockerAlreadyOccupied
  | LockerNotOccupied
  | InvalidPickupRequest
  | PackageAlreadyRetrieved
  | MalformedInput
  | StationNotFound
  | CustomerNotFound

/** Nothing free at the station fits the package. Normal, not exceptional. */
export const noSuitableLockerAvailable = (
  stationId: string
): NoSuitableLockerAvailable => ({
  code: "NoSuitableLockerAvailable",
  stationId,
  message: `No available locker at station ${stationId} is large enough for this package.`,
})

/** An occupy against a locker that already holds something — expected under contention. */
export const lockerAlreadyOccupied = (
  lockerId: string
): LockerAlreadyOccupied => ({
  code: "LockerAlreadyOccupied",
  lockerId,
  message: `Locker ${lockerId} already holds a package.`,
})

export const lockerNotOccupied = (lockerId: string): LockerNotOccupied => ({
  code: "LockerNotOccupied",
  lockerId,
  message: `Locker ${lockerId} is empty.`,
})

/**
 * Takes no arguments, and that is the point. Unknown locker, wrong code, empty
 * locker and already-collected all produce this one error, because a caller
 * who can tell them apart can map out which locker labels are real and which
 * hold a package.
 */
export const invalidPickupRequest = (): InvalidPickupRequest => ({
  code: "InvalidPickupRequest",
  message:
    "That locker and pickup code do not match a package awaiting collection.",
})

/**
 * Distinct from `InvalidPickupRequest` inside the domain, so logs and tests can
 * tell a replayed code from a wrong one, and flattened into it at the HTTP edge.
 */
export const packageAlreadyRetrieved = (
  packageId: string
): PackageAlreadyRetrieved => ({
  code: "PackageAlreadyRetrieved",
  packageId,
  message: `Package ${packageId} has already been collected.`,
})

/** A value object refused to be constructed. */
export const malformedInput = (
  field: string,
  reason: string
): MalformedInput => ({
  code: "MalformedInput",
  field,
  reason,
  message: `Invalid ${field}: ${reason}.`,
})

export const stationNotFound = (stationId: string): StationNotFound => ({
  code: "StationNotFound",
  stationId,
  message: `No station with id ${stationId}.`,
})

export const customerNotFound = (customerId: string): CustomerNotFound => ({
  code: "CustomerNotFound",
  customerId,
  message: `No customer with id ${customerId}.`,
})
