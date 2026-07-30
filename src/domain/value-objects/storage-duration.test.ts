import { unwrap } from "@/test/support/unwrap"

import { isErr } from "../shared/result"
import { StorageDuration } from "./storage-duration"

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const STORED_AT = new Date("2026-01-01T00:00:00.000Z")
const after = (elapsed: number): Date => new Date(STORED_AT.getTime() + elapsed)

const daysFor = (elapsed: number): number =>
  unwrap(StorageDuration.from(STORED_AT, after(elapsed))).chargeableDays

describe("StorageDuration", () => {
  describe("chargeable days", () => {
    // Both sides of every band. An off-by-one in the ceiling has nowhere to
    // hide when 24h and 24h+1s are asserted next to each other.
    it.each([
      ["nothing at all", 0, 1],
      ["one second", SECOND, 1],
      ["23h 59m", 23 * HOUR + 59 * MINUTE, 1],
      ["exactly 24h", 24 * HOUR, 1],
      ["24h and one second", 24 * HOUR + SECOND, 2],
      ["30h", 30 * HOUR, 2],
      ["exactly 120h", 120 * HOUR, 5],
      ["120h and one second", 120 * HOUR + SECOND, 6],
      ["exactly 240h", 240 * HOUR, 10],
      ["240h and one second", 240 * HOUR + SECOND, 11],
    ])("charges %s as %i day(s)", (_label, elapsed, expected) => {
      expect(daysFor(elapsed)).toBe(expected)
    })

    it("charges a minimum of one day, so a same-second collection is not free", () => {
      expect(daysFor(0)).toBe(1)
    })
  })

  it("measures elapsed time, not calendar dates, across a clock change", () => {
    // 2026-03-08 is the US spring-forward. A calendar-difference
    // implementation calls this two days because the date changed; it is
    // exactly 24 elapsed hours, so it is one.
    const storedAt = new Date("2026-03-08T05:00:00.000Z")
    const retrievedAt = new Date("2026-03-09T05:00:00.000Z")

    expect(
      unwrap(StorageDuration.from(storedAt, retrievedAt)).chargeableDays
    ).toBe(1)
  })

  it("rejects a collection that happened before the storage", () => {
    const result = StorageDuration.from(after(HOUR), STORED_AT)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe("MalformedInput")
  })

  it("rejects an invalid date rather than reporting NaN days", () => {
    expect(isErr(StorageDuration.from(new Date("nonsense"), STORED_AT))).toBe(
      true
    )
    expect(isErr(StorageDuration.from(STORED_AT, new Date("nonsense")))).toBe(
      true
    )
  })
})
