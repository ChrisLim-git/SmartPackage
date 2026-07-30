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
} from "./errors"

const everyError: DomainError[] = [
  noSuitableLockerAvailable("station-1"),
  lockerAlreadyOccupied("locker-1"),
  lockerNotOccupied("locker-1"),
  invalidPickupRequest(),
  packageAlreadyRetrieved("package-1"),
  malformedInput("amount", "must be an integer"),
  stationNotFound("station-1"),
  customerNotFound("customer-1"),
]

describe("domain errors", () => {
  it("gives every error a code and a message a human can read", () => {
    for (const error of everyError) {
      expect(error.code).toEqual(expect.any(String))
      expect(error.message.length).toBeGreaterThan(0)
      // A message that is only the code is not a message.
      expect(error.message).not.toBe(error.code)
    }
  })

  it("gives every error a distinct code", () => {
    const codes = everyError.map((error) => error.code)

    expect(new Set(codes).size).toBe(codes.length)
  })

  it("compares by structure, so tests never match on message text", () => {
    expect(lockerAlreadyOccupied("locker-1")).toEqual(
      lockerAlreadyOccupied("locker-1"),
    )
    expect(lockerAlreadyOccupied("locker-1")).not.toEqual(
      lockerAlreadyOccupied("locker-2"),
    )
  })

  it("carries the context that made the failure, not just the code", () => {
    const error = malformedInput("amount", "must be an integer")

    expect(error).toEqual({
      code: "MalformedInput",
      field: "amount",
      reason: "must be an integer",
      message: expect.any(String),
    })
  })

  it("narrows the union on its code", () => {
    const error: DomainError = noSuitableLockerAvailable("station-1")

    // Only the narrowing makes `stationId` reachable.
    if (error.code === "NoSuitableLockerAvailable") {
      expect(error.stationId).toBe("station-1")
    } else {
      throw new Error("expected NoSuitableLockerAvailable")
    }
  })

  it("keeps an already-retrieved package distinct from a rejected pickup", () => {
    // The two are flattened into one response at the HTTP edge, but staying
    // distinct in the domain is what lets logs and tests tell them apart.
    expect(packageAlreadyRetrieved("package-1").code).not.toBe(
      invalidPickupRequest().code,
    )
  })

  it("says nothing about why a pickup was rejected", () => {
    // Naming the failed check would tell a caller which locker labels are real
    // and which hold a package.
    expect(invalidPickupRequest()).toEqual({
      code: "InvalidPickupRequest",
      message: expect.any(String),
    })
  })
})
