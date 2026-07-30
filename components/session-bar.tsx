"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { destinationsFor } from "@/components/navigation"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

/**
 * Who is signed in, where they can go, and the way out.
 *
 * Rendered on every page: the sign-out control has to be reachable from wherever
 * a person happens to be, not only from a settings screen. The navigation is here
 * for the same reason — and because a reviewer needs to see what each role can do
 * without being told which URLs to type.
 */
export function SessionBar() {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending } = authClient.useSession()

  const signOut = async () => {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  const role = session?.user.role
  const destinations = destinationsFor(role)

  return (
    <header className="flex flex-col gap-2 border-b px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        {/* Truncates rather than wrapping: at 375px the full name took three
            lines and pushed the sign-out control off the screen. */}
        <Link href="/" className="truncate font-heading">
          Smart Package Locker
        </Link>

        {/* Nothing is rendered until the session is known, so the bar does not
            flash "sign in" at someone who is already signed in. */}
        {isPending ? null : session ? (
          // `shrink-0` so the controls keep their width and the address gives
          // way instead — the way out must never be the thing that gets clipped.
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-[24ch] truncate text-muted-foreground sm:inline">
              {session.user.email}
            </span>
            {/* Labelled, because "agent@smartpackage.test" followed by "agent"
                is read as one word by a screen reader. */}
            <span
              aria-label={`Role: ${session.user.role}`}
              className="border px-1.5 py-0.5 text-xs uppercase"
            >
              {session.user.role}
            </span>
            {/* `h-9` rather than the preset's 24px: this is chrome, not a field
                control, but it is still tapped with a thumb on the surfaces that
                matter most. */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              onClick={signOut}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 shrink-0 px-3"
          >
            <Link href="/sign-in">Sign in</Link>
          </Button>
        )}
      </div>

      {isPending ? null : (
        <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1">
          {destinations.map((destination) => {
            const here = pathname === destination.href

            return (
              <Link
                key={destination.href}
                href={destination.href}
                // `aria-current` as well as the underline: the current section
                // cannot be conveyed by weight alone.
                aria-current={here ? "page" : undefined}
                className={cn(
                  // 44px, not the 24px a bare `py-1` gives: this nav renders on
                  // the agent and collect surfaces, where DESIGN.md's tap-target
                  // floor applies to everything a thumb can reach.
                  "inline-flex min-h-11 items-center transition-colors duration-150",
                  here
                    ? "font-medium underline decoration-2 underline-offset-4"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {destination.label}
              </Link>
            )
          })}
        </nav>
      )}
    </header>
  )
}
