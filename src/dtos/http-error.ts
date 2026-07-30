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
  // A conflict, not a server fault and not a malformed request: the caller sent
  // something reasonable that the current state refuses. Replaced below with the
  // label, which the caller supplied and so already knows.
  LockerLabelTaken: {
    status: 409,
    code: "LockerLabelTaken",
    message: "A locker with that label already exists at that station.",
  },
}

export const toHttpResponse = (error: DomainError): Response => {
  const mapped = RESPONSES[error.code]

  const message =
    error.code === "MalformedInput"
      ? `${error.field}: ${error.reason}.`
      : error.code === "LockerLabelTaken"
        ? // Safe to echo, unlike an id: the caller typed this label into the
          // form a moment ago, so naming it back confirms nothing they did not
          // already supply — and an administrator fixing a clash needs to see
          // which one clashed.
          `A locker labelled "${error.label}" already exists at that station.`
        : mapped.message

  return errorResponse(mapped.code, message, mapped.status)
}

/**
 * A JSON body, parsed and validated, or the 400 to answer with.
 *
 * The four handlers that take a body all wrote the same six lines: `json()` with
 * a `catch` so malformed JSON is a refusal rather than a throw, `safeParse`, and
 * the first issue as the message. Copied, the sentence a caller reads for a bad
 * body depends on which endpoint they hit.
 *
 * Returns a discriminated union rather than throwing, for the same reason the
 * domain returns `Result`: a bad body is an expected answer to an ordinary
 * mistake, and the handler should have to say what it does about it.
 */
export const parseBody = async <TParsed>(
  request: Request,
  schema: { safeParse(value: unknown): SafeParse<TParsed> }
): Promise<{ ok: true; data: TParsed } | { ok: false; response: Response }> => {
  // `null` on malformed JSON, which the schema then refuses like any other
  // wrong shape — an empty body and `{` are the same mistake to a caller.
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  return parsed.success
    ? { ok: true, data: parsed.data }
    : {
        ok: false,
        response: errorResponse(
          "MalformedInput",
          parsed.error.issues[0].message,
          400
        ),
      }
}

/** Zod's result shape, named here so this module does not depend on Zod. */
type SafeParse<TParsed> =
  | { success: true; data: TParsed }
  | { success: false; error: { issues: { message: string }[] } }

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
