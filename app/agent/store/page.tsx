import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { isErr } from "@domain/shared/result"
import { auth } from "@infrastructure/external/auth/auth"
import { createGuards } from "@infrastructure/external/auth/guard"

const { requireRole } = createGuards(auth)

/**
 * Where an agent lands after signing in. The store-a-package flow itself is
 * T406; this exists so the role redirect has a destination and so the guard is
 * demonstrably doing something.
 */
export default async function StorePackagePage() {
  const gate = await requireRole(await headers(), "agent")

  if (isErr(gate)) redirect("/sign-in")

  return (
    // 375px-first, like every agent surface: single column, thumb reach.
    <main className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="font-heading text-2xl">Store a package</h1>
      <p className="text-sm text-muted-foreground">
        Signed in as {gate.value.user.email}. The size, customer and locker
        assignment steps arrive with the store-and-retrieve phase.
      </p>
    </main>
  )
}
