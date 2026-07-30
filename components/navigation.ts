/**
 * Where each role can go, in one place.
 *
 * Written twice before: the session bar held the navigation and the sign-in form
 * held the landing page, so adding a role meant remembering both — and forgetting
 * the second is a person who signs in successfully and arrives nowhere useful.
 *
 * This decides only what is *offered*. Every destination is guarded server-side,
 * and an agent typing `/admin` is bounced whatever this file says.
 */
export type Destination = {
  readonly href: string
  readonly label: string
}

/**
 * Collection is on every list, including the signed-out one: the person
 * collecting a parcel may well be signed in as something else, and they need no
 * account either way.
 *
 * `customer` earns a list despite there being no customer accounts — it is the
 * least-privileged role a session can carry, so it is what an account arriving by
 * any unexpected path would hold, and it should reach exactly the public page.
 */
export const DESTINATIONS = {
  admin: [
    { href: "/admin", label: "Stations & lockers" },
    { href: "/collect", label: "Collect" },
  ],
  agent: [
    { href: "/agent/store", label: "Store a package" },
    { href: "/collect", label: "Collect" },
  ],
  customer: [{ href: "/collect", label: "Collect" }],
} as const satisfies Record<string, readonly Destination[]>

export const SIGNED_OUT: readonly Destination[] = [
  { href: "/collect", label: "Collect a package" },
]

export type NavigableRole = keyof typeof DESTINATIONS

export const isNavigableRole = (role: unknown): role is NavigableRole =>
  typeof role === "string" && role in DESTINATIONS

export const destinationsFor = (role: unknown): readonly Destination[] =>
  isNavigableRole(role) ? DESTINATIONS[role] : SIGNED_OUT

/**
 * Where signing in lands somebody: the first thing their role can reach.
 *
 * Derived rather than listed separately, so a role cannot be given a home it is
 * not offered a link to.
 */
export const homeFor = (role: unknown): string =>
  isNavigableRole(role) ? DESTINATIONS[role][0].href : "/"
