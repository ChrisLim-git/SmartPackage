"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

/** Where each role belongs once it is through the door. */
const HOME_FOR_ROLE: Record<string, string> = {
  admin: "/admin",
  agent: "/agent/store",
  customer: "/",
}

export function SignInForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: failure } = await authClient.signIn.email({
      email,
      password,
    })

    if (failure) {
      // Whatever went wrong, the person sees one sentence — never a stack
      // trace, and never "no account with that address", which would turn the
      // form into a way to enumerate who has one.
      setError("That email and password do not match an account.")
      setSubmitting(false)
      return
    }

    const { data: session } = await authClient.getSession()
    const role = session?.user.role ?? "customer"

    router.push(HOME_FOR_ROLE[role] ?? "/")
    router.refresh()
  }

  return (
    // 375px-first: one column, nothing side by side, and the action
    // full-width — an agent signs in one-handed at a wall of lockers.
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error !== null}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error !== null}
        />
      </div>

      {error !== null && (
        // Announced, not just coloured: a person using a screen reader has to
        // hear that the attempt failed.
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>

      {/* No sign-up link, and no sign-up. Staff accounts are provisioned, and
          collecting a parcel needs no account at all — the collect page is
          public and the code is the credential. */}
      <p className="text-sm text-muted-foreground">
        Collecting a package?{" "}
        <Link href="/collect" className="underline underline-offset-4">
          No account needed
        </Link>
      </p>
    </form>
  )
}
