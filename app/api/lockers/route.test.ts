import { createTestDb } from "@/test/support/test-db"

import { auth } from "@infrastructure/auth/auth"
import { pool as appPool } from "@infrastructure/db/client"
import { lockerSize } from "@infrastructure/db/schema/locker-size"
import { station } from "@infrastructure/db/schema/station"

import { GET, POST } from "./route"

const { pool, db } = createTestDb()

/**
 * The route handlers over HTTP, which is the only place 401 and 403 are
 * actually distinguishable.
 *
 * The guard is unit-tested separately; what this proves is that the handlers
 * call it, and that the statuses survive the trip through a `Response`.
 */
const PASSWORD = "correct-horse-battery"

const signUp = async (email: string, role: string): Promise<string> => {
  const response = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: "Test Person" },
    asResponse: true,
  })

  await pool.query(`UPDATE "user" SET role = $1 WHERE email = $2`, [
    role,
    email,
  ])

  // Trimmed to `name=value`: a Set-Cookie sent back whole carries attributes a
  // Cookie header must not have, and the session then does not resolve.
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]

  // The role changed after the session was issued, so a fresh sign-in is what
  // puts the new role on it.
  const signedIn = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    asResponse: true,
  })

  return (signedIn.headers.get("set-cookie") ?? cookie).split(";")[0]
}

const request = (url: string, cookie?: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(cookie === undefined ? {} : { cookie }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe("/api/lockers", () => {
  let adminCookie: string
  let agentCookie: string
  let stationId: string

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

    adminCookie = await signUp("route-admin@example.test", "admin")
    agentCookie = await signUp("route-agent@example.test", "agent")
  })

  afterAll(async () => {
    await pool.query("DELETE FROM locker")
    await pool.query("DELETE FROM station")
    await pool.query("DELETE FROM locker_size")
    await pool.query(`DELETE FROM "user" WHERE email LIKE '%@example.test'`)
    await pool.end()
    // The handlers pull in the composition root, which opens the application's
    // own pool. Left open, Jest hangs — and `--forceExit` would hide it.
    await appPool.end()
  })

  describe("GET", () => {
    it("refuses a caller with no session at all", async () => {
      const response = await GET(request("http://test/api/lockers"))

      expect(response.status).toBe(401)
    })

    it("lets any signed-in person read the list", async () => {
      const response = await GET(
        request("http://test/api/lockers", agentCookie)
      )

      expect(response.status).toBe(200)
    })

    it("answers 400, not 500, for a stationId that is not a uuid", async () => {
      const response = await GET(
        request("http://test/api/lockers?stationId=not-a-uuid", agentCookie)
      )

      // Postgres would call this "invalid input syntax" and the server would
      // report a fault for what is the caller's typo.
      expect(response.status).toBe(400)
      expect((await response.json()).message).toMatch(/uuid/)
    })
  })

  describe("POST", () => {
    const locker = (label: string) => ({ stationId, sizeCode: "S", label })

    it("answers 401 unauthenticated and 403 for the wrong role", async () => {
      const anonymous = await POST(
        request("http://test/api/lockers", undefined, locker("X1"))
      )
      const asAgent = await POST(
        request("http://test/api/lockers", agentCookie, locker("X2"))
      )

      // The distinction is the point: 403 tells a caller that signing in
      // again will not help.
      expect(anonymous.status).toBe(401)
      expect(asAgent.status).toBe(403)
    })

    it("creates a locker for an admin", async () => {
      const response = await POST(
        request("http://test/api/lockers", adminCookie, locker("A1"))
      )

      expect(response.status).toBe(201)
      expect(await response.json()).toMatchObject({
        label: "A1",
        status: "available",
        size: { code: "S" },
      })
    })

    it("answers 409 for a label already used at that station", async () => {
      await POST(request("http://test/api/lockers", adminCookie, locker("B1")))

      const again = await POST(
        request("http://test/api/lockers", adminCookie, locker("B1"))
      )

      expect(again.status).toBe(409)
    })

    it("answers 400 for a body that is missing a label", async () => {
      const response = await POST(
        request("http://test/api/lockers", adminCookie, {
          stationId,
          sizeCode: "S",
        })
      )

      expect(response.status).toBe(400)
    })
  })
})
