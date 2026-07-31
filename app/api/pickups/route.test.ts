import { jest } from "@jest/globals"

import { createTestDb } from "@/utils/test-db"

const { pool, db } = createTestDb()

// The session stub serves the *store* setup only; collection is the public
// path and sends no cookie at all — that is the thing being proved.
const currentSession: { value: unknown } = { value: null }

jest.unstable_mockModule("@infrastructure/external/auth/auth", () => ({
  auth: { api: { getSession: async () => currentSession.value } },
  ROLES: ["admin", "agent", "customer"] as const,
  DEFAULT_ROLE: "customer",
}))

const { POST } = await import("./route")
const { POST: store } = await import("../packages/route")
const { pool: appPool } = await import("@infrastructure/database/client")
const { clearNetwork, seedNetwork } = await import("@/utils/network-fixture")
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
    // No cookie, no header: recipients have no account; the endpoint is deliberately public.
    currentSession.value = null

    const response = await POST(request({ pickupCode }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      // Money crosses the wire as a fixed two-decimal string, never a float.
      fee: "2.00",
      chargeableDays: 1,
      // The locker comes back from the code alone.
      lockerLabel,
      packageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      retrievedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      bands: [{ fromDay: 1, toDay: 1, days: 1, ratePerDay: "2.00" }],
    })
  })

  it("explains the fee in bands that multiply out to the fee", async () => {
    const { pickupCode } = await storeOne()

    // Backdated across the first boundary: 5 days at 2.00 + 2 at 4.00 = 18.00.
    await pool.query(
      `UPDATE package SET stored_at = now() - interval '6 days 1 hour'
       WHERE status = 'stored'`
    )
    currentSession.value = null

    const collected = (await (await POST(request({ pickupCode }))).json()) as {
      fee: string
      chargeableDays: number
      bands: { days: number; ratePerDay: string }[]
    }

    expect(collected.chargeableDays).toBe(7)
    expect(collected.fee).toBe("18.00")
    expect(collected.bands).toEqual([
      { fromDay: 1, toDay: 5, days: 5, ratePerDay: "2.00" },
      { fromDay: 6, toDay: 7, days: 2, ratePerDay: "4.00" },
    ])

    const summed = collected.bands.reduce(
      (total, band) => total + Number(band.ratePerDay) * band.days,
      0
    )
    expect(summed.toFixed(2)).toBe(collected.fee)
  })

  it("answers a code no parcel is waiting under with 404", async () => {
    await storeOne()

    expect((await POST(request({ pickupCode: "ZZZ999" }))).status).toBe(404)
  })

  it("answers a replayed code exactly as it answers an unknown one", async () => {
    const { pickupCode } = await storeOne()
    await POST(request({ pickupCode }))

    const replayed = await read(await POST(request({ pickupCode })))
    const unknown = await read(await POST(request({ pickupCode: "ZZZ999" })))

    // Byte-identical. A distinguishable "already collected" lets someone dialling
    // codes learn which ones were real, and confirm one after the parcel is gone.
    expect(replayed).toEqual(unknown)
  })

  it("gives nothing away when the flow throws", async () => {
    const { pickupCode } = await storeOne()
    // A real throw on a real path: with no pricing rows the repository refuses to price.
    await pool.query("DELETE FROM fee_tier")
    await pool.query("DELETE FROM pricing_config")

    const response = await POST(request({ pickupCode }))
    const payload = await response.text()

    expect(response.status).toBe(500)
    expect(payload).toContain("ServerError")
    // No message, no query, no table name — and no hint about whether the code
    // was even real.
    expect(payload).not.toContain("pricing")
    expect(payload).not.toContain("db:seed")
    expect(payload).not.toContain(pickupCode)
  })

  it("answers 400 for a code the alphabet cannot contain", async () => {
    // `O` and `0` are both outside the alphabet: shape wrong, not code unknown.
    const response = await POST(request({ pickupCode: "K4M9P0" }))

    // Malformed is fixable by the caller and reveals nothing about live codes.
    expect(response.status).toBe(400)
    expect((await response.json()).error.message).toMatch(/6 characters/)
  })
})
