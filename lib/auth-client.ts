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
export const authClient = createAuthClient()

export const { signIn, signOut, signUp, useSession } = authClient
