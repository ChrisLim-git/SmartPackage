import { inferAdditionalFields } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

/**
 * The browser half of auth.
 *
 * It lives in `lib/` rather than `src/infrastructure/` on purpose: a client
 * component sits in the presentation layer, which is not allowed to import
 * infrastructure, and `lib/` is a design-system leaf both may use. Nothing
 * server-side is reachable from here.
 *
 * No `baseURL`: the client defaults to the current origin, which is what we
 * want in every environment and avoids a https/http mismatch silently dropping
 * the session cookie.
 */
export const authClient = createAuthClient({
  // `role` is an additional field on the server, and without this the client's
  // session type does not know it exists. Declared inline rather than with
  // `inferAdditionalFields<typeof auth>()`: that form imports the server auth
  // type, and `lib/` is a leaf the presentation layer uses — it must not reach
  // into infrastructure, even for a type.
  // `input: false` mirrors the server. Without it the client types `role` as a
  // *required* argument to sign-up — the exact field the server refuses to
  // accept there.
  plugins: [
    inferAdditionalFields({
      user: { role: { type: "string", input: false } },
    }),
  ],
})

export const { signIn, signOut, signUp, useSession } = authClient
