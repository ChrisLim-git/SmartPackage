import { UuidV7Generator } from "./uuid-v7-generator"

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("UuidV7Generator", () => {
  const ids = new UuidV7Generator()

  it("produces version 7 uuids", () => {
    expect(ids.next()).toMatch(UUID_V7)
  })

  it("produces distinct ids", () => {
    const issued = Array.from({ length: 1_000 }, () => ids.next())

    expect(new Set(issued).size).toBe(issued.length)
  })

  it("produces ids that sort by the order they were created", () => {
    // This is the whole reason for v7 over v4: a time-ordered primary key
    // keeps the index from fragmenting, and makes "most recent" a plain sort.
    const issued = Array.from({ length: 100 }, () => ids.next())

    expect([...issued].sort()).toEqual(issued)
  })
})
