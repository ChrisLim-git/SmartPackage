import { toNextJsHandler } from "better-auth/next-js"

import { auth } from "@infrastructure/external/auth/auth"

/**
 * Every Better Auth endpoint — sign-up, sign-in, sign-out, session — behind one
 * catch-all. `app/` is the composition root, so this is a legitimate place to
 * reach into infrastructure directly.
 */
export const { GET, POST } = toNextJsHandler(auth.handler)
