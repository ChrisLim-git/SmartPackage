/**
 * The domain's failure taxonomy: a discriminated union on `code`. Plain data,
 * not `Error` subclasses — compared by structure, never by message.
 */

export type DomainErrorCode = DomainError["code"]

export type NoSuitableLockerAvailable = {
  readonly code: "NoSuitableLockerAvailable"
  /** Null when the failure came from the selection service, which is never told which station it is looking at. */
  readonly stationId: string | null
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

/** The single code for every invalid-pickup scenario; carries no context — see `invalidPickupRequest`. */
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

/** A label is unique within a station, so this carries both. */
export type LockerLabelTaken = {
  readonly code: "LockerLabelTaken"
  readonly stationId: string
  readonly label: string
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
  | LockerLabelTaken

/** Nothing free at the station fits the package. Normal, not exceptional. */
export const noSuitableLockerAvailable = (
  stationId: string | null = null
): NoSuitableLockerAvailable => ({
  code: "NoSuitableLockerAvailable",
  stationId,
  message:
    stationId === null
      ? "No available locker is large enough for this package."
      : `No available locker at station ${stationId} is large enough for this package.`,
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
 * No arguments by design: wrong, spent, and never-issued codes produce one
 * indistinguishable error, so callers cannot probe which codes are live.
 */
export const invalidPickupRequest = (): InvalidPickupRequest => ({
  code: "InvalidPickupRequest",
  message: "That pickup code does not match a package awaiting collection.",
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

/** Ordinary, not exceptional — hence a `Result`, not a throw. */
export const lockerLabelTaken = (
  stationId: string,
  label: string
): LockerLabelTaken => ({
  code: "LockerLabelTaken",
  stationId,
  label,
  message: `A locker labelled "${label}" already exists at station ${stationId}.`,
})
