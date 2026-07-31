import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { isErr } from "@domain/shared/result"
import { guards } from "@infrastructure/container"
import { LockerAdmin } from "@/components/locker-admin"

export default async function AdminPage() {
  const gate = await guards.requireRole(await headers(), "admin")

  // A page redirects where a route handler would answer 401/403 — the same
  // guard, a different edge. The two codes cannot share a destination:
  // "who are you" is answered by signing in, but sending a signed-in agent to
  // the sign-in form answers a question they have already answered.
  if (isErr(gate)) {
    redirect(gate.error.code === "Unauthenticated" ? "/sign-in" : "/")
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Every locker in the network, and where capacity is running out.
        </p>
      </header>

      {/* No `isAdmin` prop: the guard above already refused everyone else, so
          a flag computed here could only ever be true. The two layers that
          matter are this guard and the one on `POST /api/lockers`. */}
      <LockerAdmin />
    </main>
  )
}
