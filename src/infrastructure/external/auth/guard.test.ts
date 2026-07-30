import { createTestDb } from "@/utils/test-db"

import { isErr, isOk } from "@domain/shared/result"

import { createAuth, type Role } from "./auth"
import { createGuards, toResponse } from "./guard"

const { pool, db } = createTestDb()
const auth = createAuth(db)
const { requireSession, requireRole } = createGuards(auth)

const emailFor = (label: string) =>
  `guard-${label}-${process.pid}-${performance.now().toString().replace(".", "")}@example.test`

/** Signs someone up, promotes them, and returns the Cookie header for their session. */
const signedInAs = async (role: Role): Promise<Headers> => {
  const email = emailFor(role)
  const response = await auth.api.signUpEmail({
    body: { email, password: "correct-horse-battery", name: role },
    asResponse: true,
  })

  // Promotion is a database write, never a signup field — see `input: false`.
  await pool.query(`UPDATE "user" SET role = $1 WHERE email = $2`, [
    role,
    email,
  ])

  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]
  return new Headers({ cookie })
}

describe("the authorization guard", () => {
  afterAll(async () => {
    await pool.query(
      `DELETE FROM "user" WHERE email LIKE 'guard-%@example.test'`
    )
    await pool.end()
  })

  describe("requireSession", () => {
    it("refuses a request with no cookie at all", async () => {
      const result = await requireSession(new Headers())

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe("Unauthenticated")
    })

    it("lets a signed-in person through", async () => {
      const result = await requireSession(await signedInAs("customer"))

      expect(isOk(result)).toBe(true)
      if (isOk(result))
        expect(result.value.user.email).toContain("@example.test")
    })

    it("carries the role on the session, with no extra plugin", async () => {
      const result = await requireSession(await signedInAs("agent"))

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value.user.role).toBe("agent")
    })
  })

  describe("requireRole", () => {
    it("answers unauthenticated, not forbidden, when nobody is signed in", async () => {
      // "Who are you" and "not for you" are different answers, and collapsing
      // them is a real API-design error rather than a shortcut.
      const result = await requireRole(new Headers(), "agent")

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe("Unauthenticated")
    })

    it("forbids a signed-in person holding the wrong role", async () => {
      const result = await requireRole(await signedInAs("customer"), "agent")

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe("Forbidden")
    })

    it("admits the role it asks for", async () => {
      const result = await requireRole(await signedInAs("agent"), "agent")

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value.user.role).toBe("agent")
    })

    it("does not treat admin as implicitly an agent", async () => {
      // Roles are checked, not ranked. An admin who needs to store a package
      // is given the agent role, rather than inheriting it by accident.
      const result = await requireRole(await signedInAs("admin"), "agent")

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe("Forbidden")
    })

    it("accepts any one of several roles", async () => {
      const result = await requireRole(await signedInAs("admin"), [
        "admin",
        "agent",
      ])

      expect(isOk(result)).toBe(true)
    })
  })

  describe("the status codes it maps to", () => {
    it("answers 401 for unauthenticated and 403 for forbidden", async () => {
      const anonymous = await requireRole(new Headers(), "agent")
      const wrongRole = await requireRole(await signedInAs("customer"), "agent")

      expect(isErr(anonymous) && toResponse(anonymous.error).status).toBe(401)
      expect(isErr(wrongRole) && toResponse(wrongRole.error).status).toBe(403)
    })

    it("says nothing about who is signed in", async () => {
      const wrongRole = await requireRole(await signedInAs("customer"), "agent")

      if (isErr(wrongRole)) {
        const body = await toResponse(wrongRole.error).json()
        expect(JSON.stringify(body)).not.toContain("@example.test")
      }
    })
  })
})
