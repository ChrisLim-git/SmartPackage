/**
 * Single source of what each role is *offered*. Every destination is guarded
 * server-side regardless of what this file says.
 */
export type Destination = {
  readonly href: string
  readonly label: string
}

/**
 * Collection is on every list — no account needed. `customer` is the
 * least-privileged fallback role and reaches exactly the public page.
 */
export const DESTINATIONS = {
  admin: [
    { href: "/admin", label: "Stations & lockers" },
    { href: "/collect", label: "Collect a package" },
  ],
  agent: [
    { href: "/agent/store", label: "Store a package" },
    { href: "/collect", label: "Collect a package" },
  ],
  customer: [{ href: "/collect", label: "Collect a package" }],
} as const satisfies Record<string, readonly Destination[]>

export const SIGNED_OUT: readonly Destination[] = [
  { href: "/collect", label: "Collect a package" },
]

export type NavigableRole = keyof typeof DESTINATIONS

export const isNavigableRole = (role: unknown): role is NavigableRole =>
  typeof role === "string" && role in DESTINATIONS

export const destinationsFor = (role: unknown): readonly Destination[] =>
  isNavigableRole(role) ? DESTINATIONS[role] : SIGNED_OUT

/** Sign-in landing: the role's first destination, derived so home and links cannot drift. */
export const homeFor = (role: unknown): string =>
  isNavigableRole(role) ? DESTINATIONS[role][0].href : "/"
