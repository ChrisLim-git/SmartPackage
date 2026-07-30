import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { uuidv7 } from "uuidv7"

import { db } from "../../database/client"
import * as schema from "../../database/schema"

/**
 * The three roles. Only `admin` and `agent` are ever granted — the two seeded
 * accounts — because collecting a parcel needs no account at all.
 *
 * `customer` stays as the least-privileged value a role column can hold, so an
 * account arriving by any path that is not provisioning gets the role that
 * authorises nothing. It is also the wrong-role fixture the guard tests use to
 * prove `requireRole` refuses.
 */
export const ROLES = ["admin", "agent", "customer"] as const

export type Role = (typeof ROLES)[number]

export const DEFAULT_ROLE: Role = "customer"

/**
 * Email and password auth, deliberately thin.
 *
 * Imports are relative rather than aliased because `npx auth generate` loads
 * this file with its own loader, which does not read tsconfig paths.
 */
/**
 * Built as a factory so a test can point the same configuration at
 * `smartpackage_test`. The alternative — a test that signs up against the
 * module-level instance — writes users into the development database.
 */
export const createAuth = (database: typeof db) =>
  betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      // Passed explicitly. The adapter would otherwise fall back to
      // `db._.fullSchema`, which works but makes auth.ts depend on the schema
      // barrel importing this file back.
      schema,
      // Defaults to false. On Postgres there is no reason not to have it: a
      // sign-up writes `user` and `account` rows, and half of that is a
      // user who can never sign in.
      transaction: true,
    }),

    emailAndPassword: {
      // Verification is off: there is no mail transport in this challenge, and a
      // demo that cannot sign in is worse than an unverified address.
      enabled: true,
      requireEmailVerification: false,
      // Closed, because there is nobody for it to serve. Collecting a parcel
      // needs no account — the code is the credential — so a self-service
      // account would grant exactly the access an anonymous visitor already has.
      // Removing the sign-up page without this would leave the endpoint behind
      // it open, which is a decision hidden rather than taken.
      //
      // The seed provisions the two accounts that exist through
      // `auth.$context`, so closing the endpoint does not close the demo.
      disableSignUp: true,
    },

    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: DEFAULT_ROLE,
          // The security-relevant line. Without `input: false`, the role is part
          // of the sign-up payload and anyone can register as an admin.
          input: false,
        },
      },
    },

    advanced: {
      database: {
        // BetterAuth's own default is a 32-character base62 string, which is
        // why `user.id` began life as `text` and why a `uuid` audit column
        // rejected every real actor. A v7 here makes the auth tables obey the
        // same convention as the domain ones: uuid columns, time-ordered.
        //
        // `"uuid"` is the option the CLI reads to emit `uuid` columns, but on
        // Postgres it defers to `gen_random_uuid()` — v4, and unordered. The
        // function is how the value becomes a v7; the `gen_random_uuid()`
        // default left in the generated schema is a fallback that never fires,
        // exactly like the `uuidv7()` default on `primaryId()`.
        //
        // Regenerating this schema means setting `generateId: "uuid"` for the
        // duration of the run, or the CLI emits `text` columns again.
        //
        // The package function, not `UuidV7Generator`: that wrapper imports the
        // domain through a tsconfig path alias, and the CLI's loader does not
        // read them.
        generateId: () => uuidv7(),
      },
    },

    // Keep it http in development: a https baseURL means the session cookie is
    // marked Secure and never comes back over localhost.
    baseURL: process.env.BETTER_AUTH_URL,
  })

/** The instance the application uses. */
export const auth = createAuth(db)

export type Session = typeof auth.$Infer.Session
