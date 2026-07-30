import { createTestDb } from "@/test/support/test-db"

import { createAuth } from "./auth"

const { pool, db } = createTestDb()
const auth = createAuth(db)

/** Unique per run, so a re-run does not collide with the last one's rows. */
const emailFor = (label: string) =>
  `${label}-${process.pid}-${performance.now().toString().replace(".", "")}@example.test`

const signUp = (email: string, password = "correct-horse-battery") =>
  auth.api.signUpEmail({
    body: { email, password, name: "Test Person" },
    asResponse: true,
  })

describe("email and password auth", () => {
  afterAll(async () => {
    await pool.query(`DELETE FROM "user" WHERE email LIKE '%@example.test'`)
    await pool.end()
  })

  it("signs a new person up and writes them to Postgres", async () => {
    const email = emailFor("signup")

    const response = await signUp(email)

    expect(response.status).toBe(200)
    const rows = await pool.query(
      `SELECT id, email, role FROM "user" WHERE email = $1`,
      [email]
    )
    expect(rows.rows).toHaveLength(1)
  })

  it("gives the account a v7 uuid, like every other table", async () => {
    const email = emailFor("uuid")

    await signUp(email)

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
    await signUp(email)

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
    expect(account.rows[0].password).not.toContain("correct-horse-battery")
  })

  it("signs in with the right password and issues a session", async () => {
    const email = emailFor("signin")
    await signUp(email)

    const response = await auth.api.signInEmail({
      body: { email, password: "correct-horse-battery" },
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
    await signUp(email)

    // `asResponse` reports a rejection as a status, not a thrown error.
    const response = await auth.api.signInEmail({
      body: { email, password: "not-the-password" },
      asResponse: true,
    })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("refuses a second sign-up on the same address", async () => {
    const email = emailFor("dupe")
    await signUp(email)

    const response = await signUp(email)

    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  it("ends the session on sign-out", async () => {
    const email = emailFor("signout")
    await signUp(email)
    const signedIn = await auth.api.signInEmail({
      body: { email, password: "correct-horse-battery" },
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
    // Asserted against the session the cookie names, not against the row count:
    // signing up already issues a session, so this person legitimately has two
    // and signing out of one must not touch the other.
    const after = await auth.api.getSession({
      headers: new Headers({ cookie }),
    })
    expect(after).toBeNull()
  })

  it("leaves a session that was not signed out alone", async () => {
    const email = emailFor("twodevices")
    const first = await signUp(email)
    const firstCookie = (first.headers.get("set-cookie") ?? "").split(";")[0]
    const second = await auth.api.signInEmail({
      body: { email, password: "correct-horse-battery" },
      asResponse: true,
    })
    const secondCookie = (second.headers.get("set-cookie") ?? "").split(";")[0]

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

  it("will not let a sign-up choose its own role", async () => {
    // The privilege escalation this configuration exists to prevent: without
    // `input: false` on the role field, this request registers an admin.
    const email = emailFor("escalate")

    // The cast is part of the test. `role` is not in the sign-up body type —
    // that is the first line of defence — so this deliberately goes around
    // TypeScript to check the server enforces it too, the way a hand-written
    // HTTP request would.
    await auth.api.signUpEmail({
      body: {
        email,
        password: "correct-horse-battery",
        name: "Ambitious Person",
        role: "admin",
      } as never,
      asResponse: true,
    })

    const rows = await pool.query(`SELECT role FROM "user" WHERE email = $1`, [
      email,
    ])
    expect(rows.rows[0].role).toBe("customer")
  })
})
