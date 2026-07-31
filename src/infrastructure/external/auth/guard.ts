import { errorResponse } from "@dtos/http-error"
import { err, isErr, ok, type Result } from "@domain/shared/result"

import type { auth as appAuth, Role } from "./auth"

/**
 * Two distinct failures: `Unauthenticated` is "who are you", `Forbidden` is
 * "not for you" — a client must be able to tell whether signing in would help.
 */
export type AuthFailure =
  | { readonly code: "Unauthenticated"; readonly message: string }
  | { readonly code: "Forbidden"; readonly message: string }

const unauthenticated = (): AuthFailure => ({
  code: "Unauthenticated",
  message: "Sign in to continue.",
})

const forbidden = (): AuthFailure => ({
  code: "Forbidden",
  message: "Your account does not have access to this.",
})

/** The session shape the guards hand back, with `role` already on it. */
export type GuardedSession = NonNullable<
  Awaited<ReturnType<typeof appAuth.api.getSession>>
>

const STATUS: Record<AuthFailure["code"], number> = {
  Unauthenticated: 401,
  Forbidden: 403,
}

/**
 * The one place a guard failure becomes HTTP. The body carries a code and a
 * generic sentence only — naming the account or the required role leaks.
 */
export const toResponse = (failure: AuthFailure): Response =>
  errorResponse(failure.code, failure.message, STATUS[failure.code])

/** A factory so tests can point the guards at `smartpackage_test`. */
export const createGuards = (auth: typeof appAuth) => {
  const requireSession = async (
    headers: Headers
  ): Promise<Result<GuardedSession, AuthFailure>> => {
    const session = await auth.api.getSession({ headers })

    return session === null ? err(unauthenticated()) : ok(session)
  }

  /** Roles are checked, never ranked: an admin is not implicitly an agent. */
  const requireRole = async (
    headers: Headers,
    allowed: Role | readonly Role[]
  ): Promise<Result<GuardedSession, AuthFailure>> => {
    const session = await requireSession(headers)
    if (isErr(session)) return session

    const roles = Array.isArray(allowed) ? allowed : [allowed as Role]

    return roles.includes(session.value.user.role as Role)
      ? session
      : err(forbidden())
  }

  return { requireSession, requireRole }
}
