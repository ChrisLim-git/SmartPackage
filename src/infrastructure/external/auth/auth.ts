import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { uuidv7 } from "uuidv7"

import { db } from "../../database/client"
import * as schema from "../../database/schema"

/**
 * The three roles. Only `admin` and `agent` are ever granted; `customer` is
 * the least-privileged default an account gets by any non-provisioning path.
 */
export const ROLES = ["admin", "agent", "customer"] as const

export type Role = (typeof ROLES)[number]

export const DEFAULT_ROLE: Role = "customer"

/**
 * Email and password auth. Imports are relative because `npx auth generate`
 * uses its own loader, which does not read tsconfig paths. A factory so tests
 * can point the same configuration at `smartpackage_test`.
 */
export const createAuth = (database: typeof db) =>
  betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
      // Defaults to false; a sign-up writes `user` and `account` rows, and
      // half of that is a user who can never sign in.
      transaction: true,
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // Sign-up is closed: collecting a parcel needs no account, and the seed
      // provisions the only accounts that exist.
      disableSignUp: true,
    },

    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: DEFAULT_ROLE,
          // Security-relevant: without `input: false` the role would be a
          // request field and anyone could register as admin.
          input: false,
        },
      },
    },

    advanced: {
      database: {
        // v7 uuids so auth tables match the domain convention; BetterAuth's
        // default is base62 text, and `"uuid"` alone yields v4. Regeneration
        // needs `generateId: "uuid"` set for the run. The package function,
        // not `UuidV7Generator` — the CLI's loader cannot read path aliases.
        generateId: () => uuidv7(),
      },
    },

    // http in development: an https baseURL marks the cookie Secure and it
    // never comes back over localhost.
    baseURL: process.env.BETTER_AUTH_URL,
  })

/** The instance the application uses. */
export const auth = createAuth(db)

export type Session = typeof auth.$Infer.Session
