"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp"
import { RiLockUnlockLine } from "@remixicon/react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import type { CollectedPackageDto } from "@dtos/package"
import {
  PICKUP_CODE_ALPHABET,
  PICKUP_CODE_LENGTH,
} from "@domain/utils/pickup-code"

import { FIELD_SUBMIT } from "@/components/field-surface"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { useCollectPackage } from "@/hooks/use-collect-package"

/**
 * The same alphabet the domain validates against, read from the domain rather
 * than restated — a second copy of "which characters count" is a copy that drifts,
 * and the drift shows up as a code the customer typed correctly being refused.
 */
const schema = z.object({
  pickupCode: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .refine(
      (value) =>
        value.length === PICKUP_CODE_LENGTH &&
        Array.from(value).every((character) =>
          PICKUP_CODE_ALPHABET.includes(character)
        ),
      `Enter all ${PICKUP_CODE_LENGTH} characters from your code`
    ),
})

type FormValues = z.infer<typeof schema>

/**
 * "Day 3" for a single day, "Days 1–5" for a run.
 *
 * An en dash, not a hyphen: this is a range of numbers, and the two are
 * different characters for exactly this.
 */
const describeDays = (band: { fromDay: number; toDay: number }) =>
  band.fromDay === band.toDay
    ? `Day ${band.fromDay}`
    : `Days ${band.fromDay}–${band.toDay}`

/**
 * The one screen that needs no account, and it asks for one thing.
 *
 * Six digits and nothing else: no sign-in, no station, no locker number. The
 * person arriving has a code in a message and is standing in front of the lockers
 * — anything else on this form is something to transcribe before they can start.
 *
 * Every rejection says the same sentence, whatever was actually wrong. That is a
 * security property rather than laziness: an unknown code and an already-collected
 * one told apart would let someone dialling digits learn which codes are live.
 */
export const CollectPackageForm = () => {
  const [collected, setCollected] = useState<CollectedPackageDto | null>(null)

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { pickupCode: "" },
  })

  const collect = useCollectPackage()

  if (collected !== null) {
    return (
      <section className="flex flex-col gap-8" aria-live="polite">
        <div className="flex flex-col items-start gap-3">
          <RiLockUnlockLine className="size-8" aria-hidden />
          {/* The loudest thing on the screen, because it is what the person
              standing at the wall needs to act on. */}
          <h2 className="text-4xl font-semibold tracking-[-0.03em] text-balance">
            Locker {collected.lockerLabel}
          </h2>
          <p className="text-muted-foreground">
            The door is unlocked. Take the package from this locker.
          </p>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">
            Storage fee
          </p>
          <p className="text-4xl font-semibold tracking-[-0.03em]">
            ${collected.fee}
          </p>
          {/* An unexplained charge at a locker is where trust breaks, so the
              number is followed by the arithmetic behind it — every band the
              stay was charged at, not one rate standing in for several. A stay
              that crossed a boundary paid two rates, and stating only the first
              gives a figure the total contradicts. */}
          <dl className="flex flex-col gap-1 pt-2 text-[0.8125rem] text-muted-foreground">
            {collected.bands.map((band) => (
              <div key={band.fromDay} className="flex justify-between gap-4">
                <dt>{describeDays(band)}</dt>
                <dd className="font-mono tabular-nums">
                  {band.ratePerDay === "0.00"
                    ? "free"
                    : `$${band.ratePerDay} a day`}
                </dd>
              </div>
            ))}
          </dl>
          <p className="pt-2 text-[0.8125rem] text-muted-foreground">
            A part day counts as a whole one.
          </p>
        </div>

        <p className="text-[0.8125rem] text-muted-foreground">
          Close the door when you are done. The locker is free for the next
          delivery straight away, and this code will not work again.
        </p>

        {/* A declared gap rather than a silent one. The code is the only
            credential a collection presents, and confirming it on the recipient's
            email would be the second factor — but the notification channel is out
            of scope across the whole spec, so saying "check your email" here would
            promise a message nothing sends. Stated plainly instead. */}
        <p className="border-t border-border pt-4 text-[0.8125rem] text-muted-foreground">
          This collection is confirmed here on screen. A production build would
          also email a verification link to the recipient — outside the scope of
          this build.
        </p>
      </section>
    )
  }

  return (
    <form
      className="flex flex-col gap-6"
      // `mutate`, not `mutateAsync`: `handleSubmit` hands the returned promise
      // straight back to the DOM, so a rejected one surfaces as an
      // unhandledRejection in the console even though the mutation's own error
      // state is what the form renders.
      onSubmit={handleSubmit(({ pickupCode }) =>
        collect.mutate(pickupCode, { onSuccess: setCollected })
      )}
      noValidate
    >
      {collect.isError && (
        // Helpful without leaking: the advice does not say what was wrong with
        // the code, because that is exactly what an attacker is asking.
        <FormAlert
          message={collect.error.message}
          advice="Check the code and try again."
        />
      )}

      <Field data-invalid={errors.pickupCode !== undefined}>
        <FieldLabel htmlFor="pickupCode">Pickup code</FieldLabel>
        <Controller
          control={control}
          name="pickupCode"
          render={({ field }) => (
            // Six cells rather than one text input, so the code is transcribed a
            // character at a time and a miscount is visible. `one-time-code` lets
            // a phone offer the code straight out of the message it arrived in.
            //
            // `inputMode="text"` and not `numeric`: the alphabet has letters in
            // it, and a numeric keypad would leave a customer unable to type
            // their own code. `pattern` keeps the field from accepting characters
            // the alphabet excludes at all, rather than accepting and then
            // rejecting them.
            <InputOTP
              maxLength={PICKUP_CODE_LENGTH}
              inputMode="text"
              pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              containerClassName="justify-start"
              value={field.value}
              // Upper-cased as it is typed, not only on submit. `autoCapitalize`
              // is a hint a phone keyboard may honour and a desktop ignores, and
              // a code shown in a different case from the one in the message
              // reads as the wrong code to whoever is transcribing it.
              onChange={(value: string) => field.onChange(value.toUpperCase())}
              onBlur={field.onBlur}
              id="pickupCode"
            >
              <InputOTPGroup>
                {Array.from(
                  { length: PICKUP_CODE_LENGTH },
                  (_, index) => index
                ).map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="size-12 text-lg"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          )}
        />
        {errors.pickupCode && (
          <FieldError>{errors.pickupCode.message}</FieldError>
        )}
      </Field>

      <Button
        type="submit"
        size="lg"
        className={FIELD_SUBMIT}
        disabled={isSubmitting || collect.isPending}
      >
        <RiLockUnlockLine className="size-5" aria-hidden />
        {collect.isPending ? "Checking…" : "Open locker"}
      </Button>
    </form>
  )
}
