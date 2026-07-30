import type { createAuth } from "@infrastructure/external/auth/auth"
import type { Role } from "@infrastructure/external/auth/auth"

type Auth = ReturnType<typeof createAuth>

export const TEST_PASSWORD = "correct-horse-battery"

/**
 * Creates an account the way the application creates its own.
 *
 * Not through the sign-up endpoint: that endpoint is closed, because nobody
 * signs up for this service — collecting a parcel needs no account. The two
 * accounts that exist are provisioned by the seed through Better Auth's own
 * context, and this is the same path, so a test exercises what production does
 * rather than a route that has been switched off.
 *
 * Going through the context rather than an `INSERT` matters: Better Auth hashes
 * the password the way sign-in will verify it and mints the id the way the
 * configured generator does. A hand-written insert would have to reimplement
 * both, and would go stale the moment either changed.
 */
export const provisionAccount = async (
  auth: Auth,
  email: string,
  role: Role,
  password: string = TEST_PASSWORD
) => {
  const context = await auth.$context
  const hashed = await context.password.hash(password)

  const user = await context.internalAdapter.createUser({
    name: `Test ${role}`,
    email,
    emailVerified: false,
    // Settable here and nowhere else — `input: false` keeps `role` out of every
    // request payload, so a role is something granted, never something asked for.
    role,
  })

  // The password lives on a linked `credential` account, not on the user. Without
  // this the row is someone who exists and can never sign in.
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hashed,
  })

  return user
}

/** Provisions an account, signs it in, and returns the Cookie header for its session. */
export const signedInAs = async (
  auth: Auth,
  email: string,
  role: Role
): Promise<Headers> => {
  await provisionAccount(auth, email, role)

  const response = await auth.api.signInEmail({
    body: { email, password: TEST_PASSWORD },
    asResponse: true,
  })

  // A Set-Cookie carries attributes (`; Path=/; HttpOnly; …`) that a Cookie
  // header must not. Sent whole, the server finds no session token.
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]
  return new Headers({ cookie })
}
