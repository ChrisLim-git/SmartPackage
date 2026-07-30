import { errorResponse } from "@dtos/http-error"
import { err, isErr, ok, type Result } from "@domain/shared/result"

import type { auth as appAuth, Role } from "./auth"

/**
 * Two failures, deliberately distinct.
 *
 * `Unauthenticated` is "who are you" and `Forbidden` is "not for you".
 * Collapsing them into one status is a common shortcut and a real API-design
 * error: a client that cannot tell them apart cannot know whether signing in
 * would help.
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
 * The one place a guard failure becomes HTTP.
 *
 * The body carries the code and a generic sentence and nothing else — naming
 * the signed-in account or the role that would have worked tells an
 * unauthorised caller about the system.
 */
export const toResponse = (failure: AuthFailure): Response =>
  // Through `errorResponse` rather than building the envelope here. Two places
  // that both know the wire shape are two places that can stop agreeing about
  // it, and a client parsing `error.code` would find one endpoint that spelled
  // it differently.
  errorResponse(failure.code, failure.message, STATUS[failure.code])

/**
 * Built as a factory for the same reason `auth` is: a test points the guards at
 * `smartpackage_test` instead of the development database.
 */
export const createGuards = (auth: typeof appAuth) => {
  const requireSession = async (
    headers: Headers
  ): Promise<Result<GuardedSession, AuthFailure>> => {
    const session = await auth.api.getSession({ headers })

    return session === null ? err(unauthenticated()) : ok(session)
  }

  /**
   * Roles are checked, never ranked. An admin is not implicitly an agent: if an
   * administrator needs to store a package they are given the agent role, which
   * is a decision someone makes rather than a privilege that leaks in through a
   * hierarchy nobody wrote down.
   */
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
