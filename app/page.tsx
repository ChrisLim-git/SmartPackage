import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"

import { isErr } from "@domain/shared/result"
import { guards } from "@infrastructure/container"

import { FIELD_SUBMIT } from "@/components/field-surface"
import { Button } from "@/components/ui/button"
import { homeFor } from "@/components/navigation"

/** Front door. A signed-in visitor is redirected to their role's home. */
export default async function Page() {
  const session = await guards.requireSession(await headers())

  if (!isErr(session)) {
    redirect(homeFor(session.value.user.role))
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-2xl text-balance">
          Smart Package Locker
        </h1>
        <p className="text-muted-foreground">
          Parcels dropped into a locker by a delivery agent, collected with a
          six-character code. No account needed to collect.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button asChild size="lg" className={FIELD_SUBMIT}>
          <Link href="/collect">Collect a package</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className={FIELD_SUBMIT}>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>

      <p className="border-t border-border pt-4 text-label text-muted-foreground">
        Delivery agents store packages; administrators manage stations and
        lockers. Both sign in.
      </p>
    </main>
  )
}
