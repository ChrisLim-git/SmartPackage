"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { RiLoginBoxLine } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  FIELD_CONTROL,
  FIELD_ERROR,
  FIELD_LABEL,
  FIELD_SUBMIT,
} from "@/components/field-surface"
import { DemoRolePicker } from "@/components/demo-role-picker"
import { FormAlert } from "@/components/form-alert"
import { homeFor } from "@/components/navigation"
import { DEMO_MODE, DEMO_PASSWORD } from "@/lib/demo-mode"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

/** Shape only; whether the pair is right is the server's answer. */
const schema = z.object({
  email: z.email("Enter your email address"),
  password: z.string().min(1, "Enter your password"),
})

type FormValues = z.infer<typeof schema>

export function SignInForm() {
  const router = useRouter()
  const [failure, setFailure] = useState<string | null>(null)
  const [busyRole, setBusyRole] = useState<string | null>(null)

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })

  const signIn = async (values: FormValues) => {
    setFailure(null)

    const { data, error } = await authClient.signIn.email(values)

    if (error) {
      // One sentence whatever went wrong — "no account with that address"
      // would let the form enumerate accounts.
      setFailure("That email and password do not match an account.")
      return
    }

    // Role from the sign-in response, not a follow-up `getSession()` — that
    // races the cookie sign-in just set and lost about one attempt in two.
    const role = (data?.user as { role?: unknown } | undefined)?.role

    router.push(homeFor(role))
    router.refresh()
  }

  const submit = handleSubmit(signIn)

  // Demo picker goes through the same sign-in path as the form.
  const pickRole = async (email: string) => {
    setBusyRole(email.split("@")[0])
    await signIn({ email, password: DEMO_PASSWORD })
    setBusyRole(null)
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-6" noValidate>
      {DEMO_MODE && (
        <DemoRolePicker
          onPick={pickRole}
          busyRole={busyRole}
          disabled={isSubmitting || busyRole !== null}
        />
      )}

      {failure !== null && (
        <FormAlert message={failure} advice="Check both and try again." />
      )}

      <Field data-invalid={errors.email !== undefined}>
        <FieldLabel className={FIELD_LABEL} htmlFor="email">
          Email
        </FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className={FIELD_CONTROL}
          aria-invalid={errors.email !== undefined || failure !== null}
          {...register("email")}
        />
        {errors.email && (
          <FieldError className={FIELD_ERROR}>
            {errors.email.message}
          </FieldError>
        )}
      </Field>

      <Field data-invalid={errors.password !== undefined}>
        <FieldLabel className={FIELD_LABEL} htmlFor="password">
          Password
        </FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className={FIELD_CONTROL}
          aria-invalid={errors.password !== undefined || failure !== null}
          {...register("password")}
        />
        {errors.password && (
          <FieldError className={FIELD_ERROR}>
            {errors.password.message}
          </FieldError>
        )}
      </Field>

      <Button
        type="submit"
        size="lg"
        className={FIELD_SUBMIT}
        disabled={isSubmitting}
      >
        <RiLoginBoxLine className="size-5" aria-hidden />
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      {/* No sign-up: staff accounts are provisioned, and collect is public. */}
      <p className="text-muted-foreground">
        Collecting a package?{" "}
        <Link href="/collect" className="underline underline-offset-4">
          No account needed
        </Link>
      </p>
    </form>
  )
}
