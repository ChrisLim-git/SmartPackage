import {
  customerNotFound,
  type DomainError,
  invalidPickupRequest,
  lockerAlreadyOccupied,
  lockerNotOccupied,
  malformedInput,
  noSuitableLockerAvailable,
  packageAlreadyRetrieved,
  stationNotFound,
} from "@domain/shared/errors"

import { toHttpResponse, toServerFailure } from "./http-error"

const read = async (response: Response) => ({
  status: response.status,
  body: await response.text(),
})

/**
 * Every error the domain can produce, one of each.
 *
 * Written as a `Record` keyed by the union's `code` so that adding an error
 * without mapping it fails to compile here, rather than reaching a caller as a
 * 500 nobody expected.
 */
const ONE_OF_EACH: Record<DomainError["code"], DomainError> = {
  NoSuitableLockerAvailable: noSuitableLockerAvailable("station-1"),
  LockerAlreadyOccupied: lockerAlreadyOccupied("locker-1"),
  LockerNotOccupied: lockerNotOccupied("locker-1"),
  InvalidPickupRequest: invalidPickupRequest(),
  PackageAlreadyRetrieved: packageAlreadyRetrieved("package-1"),
  MalformedInput: malformedInput("pickup code", "must be exactly six digits"),
  StationNotFound: stationNotFound("station-1"),
  CustomerNotFound: customerNotFound("customer-1"),
}

describe("turning a domain error into a response", () => {
  it.each([
    ["NoSuitableLockerAvailable", 409],
    ["LockerAlreadyOccupied", 409],
    ["LockerNotOccupied", 409],
    ["InvalidPickupRequest", 404],
    ["PackageAlreadyRetrieved", 404],
    ["MalformedInput", 400],
    ["StationNotFound", 404],
    ["CustomerNotFound", 404],
  ] as [DomainError["code"], number][])(
    "answers %s with %i",
    (code, status) => {
      expect(toHttpResponse(ONE_OF_EACH[code]).status).toBe(status)
    }
  )

  it("uses one envelope for every status", async () => {
    for (const error of Object.values(ONE_OF_EACH)) {
      const body = await toHttpResponse(error).json()

      // One shape, whatever went wrong: a client parses the response once.
      expect(Object.keys(body)).toEqual(["error"])
      expect(Object.keys(body.error).sort()).toEqual(["code", "message"])
    }
  })

  it("answers a replayed code exactly as it answers a wrong one", async () => {
    const wrong = await read(toHttpResponse(invalidPickupRequest()))
    const replayed = await read(
      toHttpResponse(packageAlreadyRetrieved("package-1"))
    )

    // Byte-identical, and the security-relevant assertion in this file. A
    // distinguishable "already collected" lets someone with a wrong code learn
    // which lockers recently held a parcel — and confirm a correct code after
    // the fact.
    expect(replayed).toEqual(wrong)
  })

  it("says what is wrong with a malformed field, because the caller can fix it", async () => {
    const body = await toHttpResponse(
      malformedInput("pickup code", "must be exactly six digits")
    ).json()

    expect(body.error.message).toContain("pickup code")
    expect(body.error.message).toContain("six digits")
  })

  it.each(["StationNotFound", "CustomerNotFound"] as DomainError["code"][])(
    "keeps the identifier out of a %s response",
    async (code) => {
      const body = await toHttpResponse(ONE_OF_EACH[code]).json()

      // The domain error carries the id for the log. Echoing it back tells a
      // caller their probe reached a real row, which is the whole game with an
      // identifier they guessed.
      expect(body.error.message).not.toContain("station-1")
      expect(body.error.message).not.toContain("customer-1")
    }
  )

  it("gives nothing away when something throws, but logs it in full", async () => {
    const thrown = new Error("connect ECONNREFUSED 127.0.0.1:5432")
    const logged: unknown[] = []
    const realError = console.error
    console.error = (...args: unknown[]) => logged.push(...args)

    const response = toServerFailure(thrown)
    console.error = realError

    const body = await response.json()

    // The detail is not discarded, it is redirected: a 500 a client cannot act
    // on is still something an operator has to be able to diagnose.
    expect(logged).toContain(thrown)

    expect(response.status).toBe(500)
    // No message, no stack, no host, no port. What a client can do about it is
    // the same either way, and the detail belongs in the server log.
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED")
    expect(JSON.stringify(body)).not.toContain("5432")
    expect(body.error.code).toBe("ServerError")
  })
})
