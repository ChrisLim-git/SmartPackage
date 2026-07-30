import { jest } from "@jest/globals"

import { createTestDb } from "@/utils/test-db"

const { pool, db } = createTestDb()

/**
 * The HTTP contract of storing a parcel, and nothing below it.
 *
 * The handler is a strip: guard, validate, delegate, map. So these tests assert
 * status codes, validation failures, the wire shape and the guard wiring — the
 * only things this layer owns. Which locker was chosen and whether the smallest
 * fitting rule holds belong to `store-package-service.test.ts`, which proves them
 * in microseconds and can enumerate cases a route test never should.
 *
 * Only the session *lookup* is stubbed. `createGuards` runs for real, so the
 * 401-versus-403 decision is the real one; a stubbed guard would leave this test
 * asserting its own mock.
 */
const currentSession: { value: unknown } = { value: null }

jest.unstable_mockModule("@infrastructure/external/auth/auth", () => ({
  auth: { api: { getSession: async () => currentSession.value } },
  ROLES: ["admin", "agent", "customer"] as const,
  DEFAULT_ROLE: "customer",
}))

const { POST } = await import("./route")
const { pool: appPool } = await import("@infrastructure/database/client")
const { clearNetwork, seedNetwork } = await import("@/utils/network-fixture")

const signedInAs = (role: string, id: string) => {
  currentSession.value = { user: { id, role } }
}

const request = (body: unknown) =>
  new Request("http://test/api/packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

describe("POST /api/packages", () => {
  let stationId: string
  let agentId: string

  beforeEach(async () => {
    await clearNetwork(pool)
    const network = await seedNetwork(pool, db)
    stationId = network.stationId
    agentId = network.agentId
    signedInAs("agent", agentId)
  })

  afterAll(async () => {
    await clearNetwork(pool)
    await pool.end()
    // The handler pulls in the composition root, which opens the application's
    // own pool. Left open, Jest hangs — and `--forceExit` would hide it.
    await appPool.end()
  })

  const body = (overrides: Record<string, unknown> = {}) => ({
    stationId,
    recipient: { name: "Ada Lovelace", email: "ada@example.test" },
    packageSizeCode: "S",
    ...overrides,
  })

  it("answers 201 with the locker and the code", async () => {
    const response = await POST(request(body()))

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      lockerLabel: "S1",
      pickupCode: expect.stringMatching(/^[23456789A-HJ-KM-NP-TV-Z]{6}$/),
      storedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  })

  it("refuses a caller with no session", async () => {
    currentSession.value = null

    expect((await POST(request(body()))).status).toBe(401)
  })

  it("refuses a customer, who may collect but not store", async () => {
    signedInAs("customer", agentId)

    expect((await POST(request(body()))).status).toBe(403)
  })

  it("answers 409 when the station has nothing that fits", async () => {
    await pool.query("UPDATE locker SET status = 'occupied'")

    const response = await POST(request(body()))

    // The 409 is what this layer owns. That nothing suitable was free is proved
    // in the domain.
    expect(response.status).toBe(409)
    expect((await response.json()).error.message).toMatch(/cannot be stored/)
  })

  it("answers 400 with field detail for a missing package size", async () => {
    const response = await POST(request(body({ packageSizeCode: undefined })))

    expect(response.status).toBe(400)
    expect((await response.json()).error.message).toMatch(/package size/)
  })

  it("does not echo a station id back at whoever guessed it", async () => {
    const guessed = "019fb1ad-d64b-7fe4-bde0-9c4044892047"

    const response = await POST(request(body({ stationId: guessed })))
    const payload = await response.text()

    // The domain error carries the id so the log can name it. Echoing it into the
    // response confirms to a caller that their probe reached a real row, which is
    // the whole game with an identifier somebody typed.
    expect(response.status).toBe(404)
    expect(payload).not.toContain(guessed)
  })

  it("answers 400 for a size that is not on the ladder", async () => {
    const response = await POST(request(body({ packageSizeCode: "XL" })))

    expect(response.status).toBe(400)
    expect((await response.json()).error.message).toMatch(/XL/)
  })
})
