import type { Metadata } from "next"

import { SignInForm } from "@/components/sign-in-form"

export const metadata: Metadata = { title: "Sign in — Smart Package Locker" }

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Agents store packages. Admins manage stations.
        </p>
      </div>

      <SignInForm />
    </main>
  )
}
