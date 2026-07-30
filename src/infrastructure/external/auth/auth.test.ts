import { createTestDb } from "@/utils/test-db"
import { provisionAccount, TEST_PASSWORD } from "@/utils/test-account"

import { createAuth } from "./auth"

const { pool, db } = createTestDb()
const auth = createAuth(db)

/** Unique per run, so a re-run does not collide with the last one's rows. */
const emailFor = (label: string) =>
  `${label}-${process.pid}-${performance.now().toString().replace(".", "")}@example.test`

/**
 * Accounts are provisioned, never signed up for. The sign-up endpoint is closed
 * — see the last test in this file — so these exercise the path the seed uses.
 */
const provision = (email: string) => provisionAccount(auth, email, "customer")

describe("email and password auth", () => {
  afterAll(async () => {
    await pool.query(`DELETE FROM "user" WHERE email LIKE '%@example.test'`)
    await pool.end()
  })

  it("provisions an account and writes it to Postgres", async () => {
    const email = emailFor("provision")

    await provision(email)

    const rows = await pool.query(
      `SELECT id, email, role FROM "user" WHERE email = $1`,
      [email]
    )
    expect(rows.rows).toHaveLength(1)
  })

  it("gives the account a v7 uuid, like every other table", async () => {
    const email = emailFor("uuid")

    await provision(email)

    const rows = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [
      email,
    ])
    // The version nibble is the first character of the third group. Left to
    // its own devices BetterAuth issues a 32-character base62 string, and the
    // `uuid` audit columns pointing at this id would reject every one.
    expect(rows.rows[0].id.split("-")[2].charAt(0)).toBe("7")
  })

  it("stores the password on the account row, never on the user", async () => {
    const email = emailFor("hash")
    await provision(email)

    const user = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [
      email,
    ])
    const account = await pool.query(
      `SELECT password, provider_id FROM account WHERE user_id = $1`,
      [user.rows[0].id]
    )

    expect(account.rows).toHaveLength(1)
    expect(account.rows[0].provider_id).toBe("credential")
    // Hashed, and nowhere near the user table.
    expect(account.rows[0].password).not.toContain(TEST_PASSWORD)
  })

  it("signs in with the right password and issues a session", async () => {
    const email = emailFor("signin")
    await provision(email)

    const response = await auth.api.signInEmail({
      body: { email, password: TEST_PASSWORD },
      asResponse: true,
    })

    expect(response.status).toBe(200)
    // The cookie is the session; without it nothing else works.
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token"
    )

    const user = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [
      email,
    ])
    const sessions = await pool.query(
      `SELECT id FROM session WHERE user_id = $1`,
      [user.rows[0].id]
    )
    expect(sessions.rows.length).toBeGreaterThan(0)
  })

  it("refuses the wrong password", async () => {
    const email = emailFor("wrongpass")
    await provision(email)

    // `asResponse` reports a rejection as a status, not a thrown error.
    const response = await auth.api.signInEmail({
      body: { email, password: "not-the-password" },
      asResponse: true,
    })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("refuses a second account on the same address", async () => {
    const email = emailFor("dupe")
    await provision(email)

    // The unique index on email is what enforces it, so this rejects at the
    // database rather than politely returning a duplicate user.
    await expect(provision(email)).rejects.toThrow()
  })

  it("ends the session on sign-out", async () => {
    const email = emailFor("signout")
    await provision(email)
    const signedIn = await auth.api.signInEmail({
      body: { email, password: TEST_PASSWORD },
      asResponse: true,
    })
    // A Set-Cookie carries attributes (`; Path=/; HttpOnly; …`) that a Cookie
    // header must not. Sent whole, the server finds no session token, answers
    // 200 for a sign-out with nothing to sign out, and the row survives.
    const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0]

    const response = await auth.api.signOut({
      headers: new Headers({ cookie }),
      asResponse: true,
    })

    expect(response.status).toBe(200)
    const after = await auth.api.getSession({
      headers: new Headers({ cookie }),
    })
    expect(after).toBeNull()
  })

  it("leaves a session that was not signed out alone", async () => {
    const email = emailFor("twodevices")
    await provision(email)

    const signIn = async () => {
      const response = await auth.api.signInEmail({
        body: { email, password: TEST_PASSWORD },
        asResponse: true,
      })
      return (response.headers.get("set-cookie") ?? "").split(";")[0]
    }

    const firstCookie = await signIn()
    const secondCookie = await signIn()

    await auth.api.signOut({
      headers: new Headers({ cookie: secondCookie }),
      asResponse: true,
    })

    // Signing out on one device must not sign the person out everywhere.
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: firstCookie }),
      })
    ).not.toBeNull()
  })

  it("refuses to sign anybody up", async () => {
    // The whole self-service vector, closed. Nobody signs up for this service:
    // collecting a parcel needs no account, so an account created here would
    // hold exactly the access an anonymous visitor already has. The two staff
    // accounts are provisioned by the seed.
    //
    // This replaces an earlier test that posted `role: "admin"` in a sign-up
    // body to prove `input: false` refused the escalation. Closing the endpoint
    // is the stronger statement — there is no account to escalate. `input: false`
    // stays in place regardless, because it guards every other write of the field.
    const email = emailFor("nosignup")

    const response = await auth.api.signUpEmail({
      body: { email, password: TEST_PASSWORD, name: "Uninvited Person" },
      asResponse: true,
    })

    expect(response.status).toBeGreaterThanOrEqual(400)

    const rows = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [
      email,
    ])
    expect(rows.rows).toHaveLength(0)
  })
})
