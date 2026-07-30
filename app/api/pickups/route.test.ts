import { jest } from "@jest/globals"

import { createTestDb } from "@/test/support/test-db"

const { pool, db } = createTestDb()

/**
 * The HTTP contract of collecting a parcel.
 *
 * The session lookup is stubbed for the *store* that sets each test up, not for
 * the collection: the collection is the public path and sends no cookie at all,
 * which is the thing worth proving here.
 */
const currentSession: { value: unknown } = { value: null }

jest.unstable_mockModule("@infrastructure/external/auth/auth", () => ({
  auth: { api: { getSession: async () => currentSession.value } },
  ROLES: ["admin", "agent", "customer"] as const,
  DEFAULT_ROLE: "customer",
}))

const { POST } = await import("./route")
const { POST: store } = await import("../packages/route")
const { pool: appPool } = await import("@infrastructure/database/client")
const { clearNetwork, seedNetwork } =
  await import("@/test/support/network-fixture")
const { feeTier, pricingConfig } =
  await import("@infrastructure/database/schema/pricing")

const request = (body: unknown) =>
  new Request("http://test/api/pickups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const read = async (response: Response) => ({
  status: response.status,
  body: await response.text(),
})

describe("POST /api/pickups", () => {
  let stationId: string

  /** Stores a parcel through the real endpoint and returns its locker and code. */
  const storeOne = async () => {
    const response = await store(
      new Request("http://test/api/packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stationId,
          recipient: { name: "Ada Lovelace", email: "ada@example.test" },
          packageSizeCode: "S",
        }),
      })
    )

    return (await response.json()) as {
      lockerLabel: string
      pickupCode: string
    }
  }

  beforeEach(async () => {
    await pool.query("DELETE FROM fee_tier")
    await pool.query("DELETE FROM pricing_config")
    await clearNetwork(pool)

    const network = await seedNetwork(pool, db)
    stationId = network.stationId
    currentSession.value = { user: { id: network.agentId, role: "agent" } }

    await db
      .insert(pricingConfig)
      .values({ baseRatePerDay: "2.00", currencyCode: "AUD" })
    await db.insert(feeTier).values([
      { fromDay: 1, toDay: 5, multiplierHundredths: 100 },
      { fromDay: 6, toDay: 10, multiplierHundredths: 200 },
      { fromDay: 11, toDay: null, multiplierHundredths: 300 },
    ])
  })

  afterAll(async () => {
    await pool.query("DELETE FROM fee_tier")
    await pool.query("DELETE FROM pricing_config")
    await clearNetwork(pool)
    await pool.end()
    await appPool.end()
  })

  it("lets someone with no session at all collect a parcel", async () => {
    const { lockerLabel, pickupCode } = await storeOne()
    // No cookie, no header, nothing. A recipient has no account, and requiring
    // one would make a first delivery uncollectable.
    currentSession.value = null

    const response = await POST(request({ stationId, lockerLabel, pickupCode }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      // A same-day collection is one chargeable day at the base rate, as a fixed
      // two-decimal string: a float here is the money rule broken at the edge.
      fee: "2.00",
      packageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      retrievedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  })

  it("answers a wrong code with 404", async () => {
    const { lockerLabel } = await storeOne()

    const response = await POST(
      request({ stationId, lockerLabel, pickupCode: "999999" })
    )

    expect(response.status).toBe(404)
  })

  it("answers a replayed code exactly as it answers a wrong one", async () => {
    const { lockerLabel, pickupCode } = await storeOne()
    await POST(request({ stationId, lockerLabel, pickupCode }))

    const replayed = await read(
      await POST(request({ stationId, lockerLabel, pickupCode }))
    )
    const wrong = await read(
      await POST(request({ stationId, lockerLabel, pickupCode: "999999" }))
    )

    // Byte-identical. A distinguishable "already collected" tells someone with a
    // wrong code which lockers recently held a parcel, and confirms a correct
    // code after the fact.
    expect(replayed).toEqual(wrong)
  })

  it("answers an unknown locker exactly the same way too", async () => {
    const { pickupCode } = await storeOne()

    const unknown = await read(
      await POST(request({ stationId, lockerLabel: "Z9", pickupCode }))
    )
    const wrong = await read(
      await POST(
        request({ stationId, lockerLabel: "S1", pickupCode: "999999" })
      )
    )

    expect(unknown).toEqual(wrong)
  })

  it("answers 400 for a code that is not six digits", async () => {
    const { lockerLabel } = await storeOne()

    const response = await POST(
      request({ stationId, lockerLabel, pickupCode: "abc" })
    )

    // Malformed, not invalid: the shape is wrong, the caller can fix it, and
    // saying so reveals nothing about the estate.
    expect(response.status).toBe(400)
    expect((await response.json()).error.message).toMatch(/six digits/)
  })

  it("answers 400 for a station id that is not a uuid", async () => {
    const response = await POST(
      request({ stationId: "central", lockerLabel: "S1", pickupCode: "402913" })
    )

    // Otherwise Postgres answers "invalid input syntax" and a caller's typo
    // surfaces as a 500 — the server reporting a fault it does not have.
    expect(response.status).toBe(400)
  })
})
