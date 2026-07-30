"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp"
import { RiLockUnlockLine } from "@remixicon/react"
import { QRCodeSVG } from "qrcode.react"
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
            Scan this at the kiosk and the door opens.
          </p>
        </div>

        {/* A light field regardless of theme: a scanner reads dark modules on a
            light background, and an inverted code fails on plenty of hardware. */}
        <div className="flex justify-center border border-border bg-white p-4">
          <QRCodeSVG
            value={collected.unlockUri}
            size={200}
            marginSize={0}
            title={`Unlock locker ${collected.lockerLabel}`}
          />
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">
            Storage fee
          </p>
          <p className="text-4xl font-semibold tracking-[-0.03em]">
            ${collected.fee}
          </p>
          {/* An unexplained charge at a locker is where trust breaks, so the
              number is followed by the arithmetic behind it: the days, the rate
              they were charged at, and where the rate starts rising. */}
          <p className="pt-2 text-[0.8125rem] text-muted-foreground">
            {collected.chargeableDays === 1
              ? `One day at $${collected.dailyRate} a day.`
              : `${collected.chargeableDays} days at $${collected.dailyRate} a day`}
            {collected.chargeableDays > 1 &&
              collected.firstTierEndsOnDay !== null &&
              `, rising after day ${collected.firstTierEndsOnDay}`}
            {collected.chargeableDays > 1 && "."} A part day counts as a whole
            one.
          </p>
        </div>

        <p className="text-[0.8125rem] text-muted-foreground">
          Take the package and close the door. The locker is free for the next
          delivery straight away, and this code will not work again.
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
