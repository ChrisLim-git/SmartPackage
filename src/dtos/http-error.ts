import type { DomainError } from "@domain/shared/errors"

/**
 * One envelope for every failure, whatever its status: a client parses the
 * response once and reads `error.code` to decide, `error.message` to show.
 */
export type ErrorDto = {
  error: {
    code: string
    message: string
  }
}

export const errorResponse = (
  code: string,
  message: string,
  status: number
): Response => Response.json({ error: { code, message } }, { status })

/**
 * What each failure becomes on the wire — the status, and the sentence a person
 * sees.
 *
 * The domain error's own message is deliberately *not* forwarded. It carries the
 * station id, the locker id or the package id for the log, and echoing an
 * identifier back confirms to whoever guessed it that it names a real row.
 *
 * `PackageAlreadyRetrieved` answers as `InvalidPickupRequest`, down to the code
 * in the body. Distinguishing the two would let someone holding a wrong code
 * learn which lockers recently held a parcel, and confirm a correct code after
 * the parcel was collected. Unknown locker, wrong code, wrong locker and empty
 * locker collapse for the same reason: told apart, the endpoint is a map of the
 * estate.
 */
const RESPONSES: Record<
  DomainError["code"],
  { status: number; code: string; message: string }
> = {
  NoSuitableLockerAvailable: {
    status: 409,
    code: "NoSuitableLockerAvailable",
    message: "No suitable locker is available. The package cannot be stored.",
  },
  LockerAlreadyOccupied: {
    status: 409,
    code: "LockerAlreadyOccupied",
    message: "That locker already holds a package.",
  },
  LockerNotOccupied: {
    status: 409,
    code: "LockerNotOccupied",
    message: "That locker is empty.",
  },
  InvalidPickupRequest: {
    status: 404,
    code: "InvalidPickupRequest",
    message: "That code does not match a package waiting to be collected.",
  },
  PackageAlreadyRetrieved: {
    status: 404,
    code: "InvalidPickupRequest",
    message: "That code does not match a package waiting to be collected.",
  },
  MalformedInput: {
    status: 400,
    code: "MalformedInput",
    // Replaced below with the field and the reason: a caller can fix their own
    // request, and telling them how reveals nothing about the estate.
    message: "That request is not valid.",
  },
  StationNotFound: {
    status: 404,
    code: "StationNotFound",
    message: "That station does not exist.",
  },
  CustomerNotFound: {
    status: 404,
    code: "CustomerNotFound",
    message: "That customer does not exist.",
  },
}

export const toHttpResponse = (error: DomainError): Response => {
  const mapped = RESPONSES[error.code]

  const message =
    error.code === "MalformedInput"
      ? `${error.field}: ${error.reason}.`
      : mapped.message

  return errorResponse(mapped.code, message, mapped.status)
}

/**
 * The last resort: something threw.
 *
 * Logged in full server-side and answered with nothing. A thrown error here
 * means a bug or an infrastructure failure, and its message is a connection
 * string, a query or a stack — none of which a client can act on and all of
 * which describe the inside of the system.
 */
export const toServerFailure = (thrown: unknown): Response => {
  console.error("unhandled failure", thrown)

  return errorResponse(
    "ServerError",
    "Something went wrong on our side. Please try again.",
    500
  )
}
