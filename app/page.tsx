import Link from "next/link"

import { FIELD_SUBMIT } from "@/components/field-surface"
import { Button } from "@/components/ui/button"

/**
 * The front door, and the only page a reviewer reaches with no credentials.
 *
 * Collection leads, because it is the one thing a person arriving with a code in a
 * message actually wants. Signing in is second and quieter — the agent and the
 * administrator both already know where they are going.
 */
export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-8 p-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-2xl text-balance">
          Smart Package Locker
        </h1>
        <p className="text-muted-foreground">
          Parcels dropped into a locker by a delivery agent, collected with a
          six-digit code. No account needed to collect.
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

      <p className="border-t border-border pt-4 text-[0.8125rem] text-muted-foreground">
        Delivery agents store packages; administrators manage stations and
        lockers. Both sign in.
      </p>
    </main>
  )
}
