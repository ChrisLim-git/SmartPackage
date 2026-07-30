import type { Metadata } from "next"

import { SignUpForm } from "@presentation/components/sign-up-form"

export const metadata: Metadata = {
  title: "Create an account — Smart Package Locker",
}

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          New accounts collect packages. Staff roles are granted, not chosen.
        </p>
      </div>

      <SignUpForm />
    </main>
  )
}
