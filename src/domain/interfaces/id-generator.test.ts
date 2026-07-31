import { SequentialIdGenerator } from "@/utils/stub-sequential-id-generator"

describe("SequentialIdGenerator", () => {
  it("yields distinct ids", () => {
    const ids = new SequentialIdGenerator()

    expect(new Set([ids.next(), ids.next(), ids.next()]).size).toBe(3)
  })

  it("yields ids a failing assertion can be read from", () => {
    const ids = new SequentialIdGenerator("locker")

    expect(ids.next()).toBe("locker-0001")
    expect(ids.next()).toBe("locker-0002")
  })

  it("pads so the ids sort into the order they were issued", () => {
    // Real generator is UUIDv7 (time-ordered); the double must sort in issue order too.
    const ids = new SequentialIdGenerator()
    const issued = Array.from({ length: 11 }, () => ids.next())

    expect([...issued].sort()).toEqual(issued)
  })
})
