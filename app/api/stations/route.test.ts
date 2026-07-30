import { jest } from "@jest/globals"

import { createTestDb } from "@/utils/test-db"

const { pool } = createTestDb()

/**
 * The handlers, with the session looked up rather than earned — the same
 * arrangement as `/api/lockers`, and for the same reason: what is stubbed is
 * only the session lookup, so `createGuards` still makes the real 401-versus-403
 * decision and everything below the handler is real.
 */
const currentSession: { value: unknown } = { value: null }

jest.unstable_mockModule("@infrastructure/external/auth/auth", () => ({
  auth: { api: { getSession: async () => currentSession.value } },
  ROLES: ["admin", "agent", "customer"] as const,
  DEFAULT_ROLE: "customer",
}))

const { GET, POST } = await import("./route")
const { pool: appPool } = await import("@infrastructure/database/client")

/** A uuid, because `created_by` is a uuid column even though it carries no key. */
const ADMIN_ID = "019fb1ad-d64b-7fe4-bde0-9c4044892047"

const signedInAs = (role: string) => {
  currentSession.value = { user: { id: ADMIN_ID, role } }
}

const request = (body?: unknown) =>
  new Request("http://test/api/stations", {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const details = (overrides: Record<string, unknown> = {}) => ({
  name: "Route Test Station",
  address: "1 Test Street",
  ...overrides,
})

describe("/api/stations", () => {
  afterAll(async () => {
    await pool.query("DELETE FROM station")
    await pool.end()
    // The handlers pull in the composition root, which opens the application's
    // own pool. Left open, Jest hangs — and `--forceExit` would hide it.
    await appPool.end()
  })

  describe("POST", () => {
    it("answers 401 unauthenticated and 403 for the wrong role", async () => {
      currentSession.value = null
      expect((await POST(request(details()))).status).toBe(401)

      // An agent works at a station; deciding there should be one is an
      // administrator's call.
      signedInAs("agent")
      expect((await POST(request(details()))).status).toBe(403)
    })

    it("registers a station for an admin and answers with the wire shape", async () => {
      signedInAs("admin")

      const response = await POST(request(details({ name: "Central Mall" })))

      expect(response.status).toBe(201)
      expect(await response.json()).toMatchObject({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: "Central Mall",
        address: "1 Test Street",
      })
    })

    it("makes it readable straight away, so a locker can be added to it", async () => {
      signedInAs("admin")

      const created = await (await POST(request(details()))).json()
      const listed = (await (await GET(request())).json()) as { id: string }[]

      expect(listed.map((station) => station.id)).toContain(created.id)
    })

    it("answers 400 for a body with no name", async () => {
      signedInAs("admin")

      const response = await POST(request(details({ name: "   " })))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: "MalformedInput" },
      })
    })

    it("answers 400 for a body with no address", async () => {
      signedInAs("admin")

      const response = await POST(request(details({ address: "" })))

      expect(response.status).toBe(400)
    })

    it("stamps the acting admin on the row it created", async () => {
      signedInAs("admin")

      const created = await (await POST(request(details()))).json()
      const rows = await pool.query(
        `SELECT created_by FROM station WHERE id = $1`,
        [created.id]
      )

      expect(rows.rows[0].created_by).toBe(ADMIN_ID)
    })
  })

  describe("GET", () => {
    it("refuses a caller with no session at all", async () => {
      currentSession.value = null

      expect((await GET(request())).status).toBe(401)
    })
  })
})
