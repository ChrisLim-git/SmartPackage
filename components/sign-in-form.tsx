"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { RiLoginBoxLine } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { FIELD_CONTROL, FIELD_SUBMIT } from "@/components/field-surface"
import { FormAlert } from "@/components/form-alert"
import { homeFor } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

/**
 * Shape only. Whether the pair is *right* is the server's answer and arrives as
 * one sentence — this is here so an empty submit is caught before a request.
 */
const schema = z.object({
  email: z.email("Enter your email address"),
  password: z.string().min(1, "Enter your password"),
})

type FormValues = z.infer<typeof schema>

export function SignInForm() {
  const router = useRouter()
  const [failure, setFailure] = useState<string | null>(null)

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })

  const submit = handleSubmit(async (values) => {
    setFailure(null)

    const { error } = await authClient.signIn.email(values)

    if (error) {
      // Whatever went wrong, the person sees one sentence — never a stack
      // trace, and never "no account with that address", which would turn the
      // form into a way to enumerate who has one.
      setFailure("That email and password do not match an account.")
      return
    }

    const { data: session } = await authClient.getSession()

    // The first place the role can reach, taken from the same list the session
    // bar offers — so nobody lands somewhere their navigation does not go.
    router.push(homeFor(session?.user.role))
    router.refresh()
  })

  return (
    // 375px-first: one column, nothing side by side, and the action full-width
    // — an agent signs in one-handed at a wall of lockers. The controls carry
    // the field-surface sizing for the same reason the other two forms do; the
    // preset's 28-pixel input is right for an admin table and wrong here.
    <form onSubmit={submit} className="flex w-full flex-col gap-6" noValidate>
      {failure !== null && (
        <FormAlert message={failure} advice="Check both and try again." />
      )}

      <Field data-invalid={errors.email !== undefined}>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className={FIELD_CONTROL}
          aria-invalid={errors.email !== undefined || failure !== null}
          {...register("email")}
        />
        {errors.email && <FieldError>{errors.email.message}</FieldError>}
      </Field>

      <Field data-invalid={errors.password !== undefined}>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className={FIELD_CONTROL}
          aria-invalid={errors.password !== undefined || failure !== null}
          {...register("password")}
        />
        {errors.password && <FieldError>{errors.password.message}</FieldError>}
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

      {/* No sign-up link, and no sign-up. Staff accounts are provisioned, and
          collecting a parcel needs no account at all — the collect page is
          public and the code is the credential. */}
      <p className="text-muted-foreground">
        Collecting a package?{" "}
        <Link href="/collect" className="underline underline-offset-4">
          No account needed
        </Link>
      </p>
    </form>
  )
}
