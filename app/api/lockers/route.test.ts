import { jest } from "@jest/globals"

import { createTestDb } from "@/utils/test-db"

const { pool, db } = createTestDb()

// Only the session lookup is stubbed. `createGuards`, validation, the
// repository and the unique index all run for real, so 401-vs-403 is the real decision.
const currentSession: { value: unknown } = { value: null }

jest.unstable_mockModule("@infrastructure/external/auth/auth", () => ({
  auth: { api: { getSession: async () => currentSession.value } },
  ROLES: ["admin", "agent", "customer"] as const,
  DEFAULT_ROLE: "customer",
}))

// Imported after the mock is registered: an ESM module graph is resolved on
// import, so a static import here would bind the real `auth` first.
const { GET, POST } = await import("./route")
const { pool: appPool } = await import("@infrastructure/database/client")
const { lockerSize } =
  await import("@infrastructure/database/schema/locker-size")
const { station } = await import("@infrastructure/database/schema/station")

/** A uuid, because `created_by` is a uuid column even though it carries no key. */
const ADMIN_ID = "019fb1ad-d64b-7fe4-bde0-9c4044892047"

const signedInAs = (role: string) => {
  currentSession.value = { user: { id: ADMIN_ID, role } }
}

const signedOut = () => {
  currentSession.value = null
}

const request = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe("/api/lockers", () => {
  let stationId: string

  const locker = (label: string) => ({ stationId, sizeCode: "S", label })

  beforeAll(async () => {
    await db
      .insert(lockerSize)
      .values({ code: "S", rank: 1, label: "Small" })
      .onConflictDoNothing()
    const [created] = await db
      .insert(station)
      .values({ name: "Route Test Station", address: "1 Test Street" })
      .returning()
    stationId = created.id
  })

  afterAll(async () => {
    await pool.query("DELETE FROM locker")
    await pool.query("DELETE FROM station")
    await pool.query("DELETE FROM locker_size")
    await pool.end()
    // The handlers pull in the composition root, which opens the application's
    // own pool. Left open, Jest hangs — and `--forceExit` would hide it.
    await appPool.end()
  })

  describe("GET", () => {
    it("refuses a caller with no session at all", async () => {
      signedOut()

      expect((await GET(request("http://test/api/lockers"))).status).toBe(401)
    })

    it("answers a signed-in reader with the wire shape, not the entity", async () => {
      signedInAs("admin")
      await POST(request("http://test/api/lockers", locker("R1")))
      signedInAs("agent")

      const response = await GET(request("http://test/api/lockers"))
      const body = await response.json()

      expect(response.status).toBe(200)
      // Asserts the wire shape, not the entity; any role may read.
      expect(body).toContainEqual(
        expect.objectContaining({
          label: "R1",
          status: "available",
          size: expect.objectContaining({ code: "S", rank: 1 }),
        })
      )
    })

    it("answers 400, not 500, for a stationId that is not a uuid", async () => {
      signedInAs("agent")

      const response = await GET(
        request("http://test/api/lockers?stationId=not-a-uuid")
      )

      // Unchecked, Postgres's "invalid input syntax" becomes a 500 for a caller typo.
      expect(response.status).toBe(400)
      expect((await response.json()).error.message).toMatch(/uuid/)
    })
  })

  describe("POST", () => {
    it("answers 401 unauthenticated and 403 for the wrong role", async () => {
      signedOut()
      const anonymous = await POST(
        request("http://test/api/lockers", locker("X1"))
      )

      signedInAs("agent")
      const asAgent = await POST(
        request("http://test/api/lockers", locker("X2"))
      )

      // The distinction is the point: 403 tells a caller that signing in
      // again will not help.
      expect(anonymous.status).toBe(401)
      expect(asAgent.status).toBe(403)
    })

    it("creates a locker for an admin", async () => {
      signedInAs("admin")

      const response = await POST(
        request("http://test/api/lockers", locker("A1"))
      )

      expect(response.status).toBe(201)
      expect(await response.json()).toMatchObject({
        label: "A1",
        status: "available",
        size: { code: "S" },
      })
    })

    it("answers 409 for a label already used at that station", async () => {
      signedInAs("admin")
      await POST(request("http://test/api/lockers", locker("B1")))

      const again = await POST(request("http://test/api/lockers", locker("B1")))

      expect(again.status).toBe(409)
    })

    it("answers 400 for a body that is missing a label", async () => {
      signedInAs("admin")

      const response = await POST(
        request("http://test/api/lockers", { stationId, sizeCode: "S" })
      )

      expect(response.status).toBe(400)
    })

    it("answers 400, not 500, for a size code that is not on the ladder", async () => {
      signedInAs("admin")

      // The repository answers "no such size" by throwing; unchecked that is a 500.
      const response = await POST(
        request("http://test/api/lockers", {
          stationId,
          sizeCode: "XL",
          label: "D1",
        })
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: "MalformedInput" },
      })
    })

    it("answers 404, not 500, for a station that does not exist", async () => {
      signedInAs("admin")

      // The station is checked before the insert; the FK violation used to be a 500.
      const response = await POST(
        request("http://test/api/lockers", {
          stationId: "019fb1ad-d64b-7fe4-bde0-000000000000",
          sizeCode: "S",
          label: "D9",
        })
      )

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({
        error: { code: "StationNotFound" },
      })
    })

    it("stamps the acting admin on the row it created", async () => {
      signedInAs("admin")

      const response = await POST(
        request("http://test/api/lockers", locker("C1"))
      )
      const created = await response.json()

      const row = await pool.query(
        "SELECT created_by FROM locker WHERE id = $1",
        [created.id]
      )
      // Proves `AuditContext` carried the session user to the repository.
      expect(row.rows[0].created_by).toBe(ADMIN_ID)
    })
  })
})
