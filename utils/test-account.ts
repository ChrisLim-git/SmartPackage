import type { createAuth } from "@infrastructure/external/auth/auth"
import type { Role } from "@infrastructure/external/auth/auth"

type Auth = ReturnType<typeof createAuth>

export const TEST_PASSWORD = "correct-horse-battery"

/**
 * Creates an account the way the seed does — through Better Auth's context, not
 * the (closed) sign-up endpoint or a raw INSERT, so hashing and ids match production.
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
    // Settable here and nowhere else — `input: false` keeps `role` out of request payloads.
    role,
  })

  // The password lives on a linked `credential` account, not on the user.
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

  // A Set-Cookie carries attributes a Cookie header must not; sent whole, the
  // server finds no session token.
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]
  return new Headers({ cookie })
}
