import { redirect } from "next/navigation"
import { headers } from "next/headers"

import { auth } from "@infrastructure/auth/auth"
import { createGuards } from "@infrastructure/auth/guard"
import { isErr } from "@domain/shared/result"

const { requireRole } = createGuards(auth)

/**
 * A landing place for the admin role, so the post-sign-in redirect has
 * somewhere to arrive. The stations, lockers and availability tables that
 * belong here are built in T306.
 */
export default async function AdminPage() {
  const gate = await requireRole(await headers(), "admin")

  // A page redirects where a route handler would answer 401/403 — the same
  // guard, a different edge.
  if (isErr(gate)) redirect("/sign-in")

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <h1 className="font-heading text-2xl">Administration</h1>
      <p className="text-sm text-muted-foreground">
        Signed in as {gate.value.user.email}. Stations, lockers and availability
        arrive with the master-data phase.
      </p>
    </main>
  )
}
