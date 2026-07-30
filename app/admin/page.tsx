import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { isErr } from "@domain/shared/result"
import { auth } from "@infrastructure/external/auth/auth"
import { createGuards } from "@infrastructure/external/auth/guard"
import { LockerAdmin } from "@presentation/views/locker-admin"

const { requireRole } = createGuards(auth)

export default async function AdminPage() {
  const gate = await requireRole(await headers(), "admin")

  // A page redirects where a route handler would answer 401/403 — the same
  // guard, a different edge.
  if (isErr(gate)) redirect("/sign-in")

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Every locker in the network, and where capacity is running out.
        </p>
      </header>

      {/* The role is resolved on the server and passed down, so the client
          never decides for itself whether it is an admin. */}
      <LockerAdmin isAdmin={gate.value.user.role === "admin"} />
    </main>
  )
}
