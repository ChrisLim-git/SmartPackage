"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { destinationsFor } from "@/components/navigation"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

/** Signed-in identity, per-role navigation and sign-out, rendered on every page. */
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
        {/* Truncates: wrapping pushed the sign-out control off a 375px screen. */}
        <Link href="/" className="truncate font-heading">
          Smart Package Locker
        </Link>

        {/* Nothing renders until the session is known — no "sign in" flash. */}
        {isPending ? null : session ? (
          // `shrink-0`: the address gives way, never the sign-out control.
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-[24ch] truncate text-muted-foreground sm:inline">
              {session.user.email}
            </span>
            {/* Labelled: email followed by role reads as one word to a screen reader. */}
            <span
              aria-label={`Role: ${session.user.role}`}
              className="border px-1.5 py-0.5 text-xs uppercase"
            >
              {session.user.role}
            </span>
            {/* `h-9` over the preset's 24px: still tapped with a thumb. */}
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
                // `aria-current` too: the current section cannot be weight alone.
                aria-current={here ? "page" : undefined}
                className={cn(
                  // min-h-11: DESIGN.md's 44px tap-target floor.
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
