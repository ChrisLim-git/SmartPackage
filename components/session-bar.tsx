"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

/**
 * Who is signed in, and the way out.
 *
 * Rendered on every page: the sign-out control has to be reachable from
 * wherever a person happens to be, not only from a settings screen.
 */
export function SessionBar() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()

  const signOut = async () => {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm">
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
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      ) : (
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      )}
    </header>
  )
}
