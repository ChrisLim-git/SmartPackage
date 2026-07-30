// Must stay first: it loads the environment, and every import below reads it
// while being evaluated. Moving it down leaves the pool without a password.
import "./load-env"

import { auth, type Role } from "../auth/auth"
import { pool } from "./client"

/**
 * Master data lives here rather than in a migration: it is reference data an
 * operator may want to re-run or edit, not a schema change.
 *
 * Stations, locker sizes, lockers and the pricing configuration land in T302.
 */

/**
 * One account per role, so a reviewer can sign in as each without creating
 * anything. The password is the same for all three and is published in the
 * README — these accounts exist on a local demo database, and making them hard
 * to find would only cost a reviewer time without protecting anything.
 */
const ACCOUNTS: ReadonlyArray<{ name: string; email: string; role: Role }> = [
  { name: "Avery Admin", email: "admin@smartpackage.test", role: "admin" },
  { name: "Ada Agent", email: "agent@smartpackage.test", role: "agent" },
  {
    name: "Cam Customer",
    email: "customer@smartpackage.test",
    role: "customer",
  },
]

const SEED_PASSWORD = "smartpackage"

/** Re-runnable: an account that already exists is left exactly as it is. */
const seedAccounts = async () => {
  for (const account of ACCOUNTS) {
    const existing = await pool.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [account.email]
    )

    if (existing.rows.length > 0) {
      console.log(`  ${account.email} — already there`)
      continue
    }

    // Through the auth API rather than an INSERT: the password has to be
    // hashed the way sign-in will verify it, and only Better Auth knows how.
    await auth.api.signUpEmail({
      body: {
        name: account.name,
        email: account.email,
        password: SEED_PASSWORD,
      },
      asResponse: true,
    })

    // The role is a privileged field that a sign-up cannot set, so it is
    // granted here — the same promotion path an admin screen would use.
    await pool.query(`UPDATE "user" SET role = $1 WHERE email = $2`, [
      account.role,
      account.email,
    ])

    console.log(`  ${account.email} — created as ${account.role}`)
  }
}

async function seed() {
  console.log("Accounts:")
  await seedAccounts()
  console.log(
    "Master data (stations, sizes, lockers, pricing) arrives in T302."
  )
}

seed()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
