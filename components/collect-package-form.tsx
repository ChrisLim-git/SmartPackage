"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { RiLockUnlockLine } from "@remixicon/react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import type { CollectedPackageDto } from "@dtos/package"
import {
  PICKUP_CODE_ALPHABET,
  PICKUP_CODE_LENGTH,
} from "@domain/utils/pickup-code"

import {
  FIELD_ERROR,
  FIELD_LABEL,
  FIELD_SUBMIT,
} from "@/components/field-surface"
import { DemoParcels } from "@/components/demo-parcels"
import { FormAlert } from "@/components/form-alert"
import { DEMO_MODE } from "@/lib/demo-mode"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { useCollectPackage } from "@/hooks/use-collect-package"

/** Alphabet read from the domain, not restated, so the two validations cannot drift. */
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

// Both cases: the field upper-cases on change, so an uppercase-only pattern
// would silently swallow every lowercase keystroke.
const ALPHABET_PATTERN = `^[${PICKUP_CODE_ALPHABET}${PICKUP_CODE_ALPHABET.toLowerCase()}]*$`

/** "Day 3" for a single day, "Days 1–5" (en dash) for a run. */
const describeDays = (band: { fromDay: number; toDay: number }) =>
  band.fromDay === band.toDay
    ? `Day ${band.fromDay}`
    : `Days ${band.fromDay}–${band.toDay}`

/**
 * Public collect screen — no account. Every rejection says the same sentence
 * whatever was wrong: distinguishing unknown from collected would reveal live codes.
 */
export const CollectPackageForm = () => {
  const [collected, setCollected] = useState<CollectedPackageDto | null>(null)

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { pickupCode: "" },
  })

  const collect = useCollectPackage()

  if (collected !== null) {
    return (
      <section className="flex flex-col gap-8">
        {/* One-sentence announcement — a live region on the whole block read out everything. */}
        <p className="sr-only" role="status">
          Locker {collected.lockerLabel} is open. Storage fee ${collected.fee}.
        </p>

        <div className="flex animate-result flex-col items-start gap-3">
          <RiLockUnlockLine className="size-8" aria-hidden />
          <h2 className="text-6xl font-semibold tracking-[-0.03em] text-balance">
            Locker {collected.lockerLabel}
          </h2>
          <p className="text-muted-foreground">
            The door is unlocked. Take the package from this locker.
          </p>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="text-label font-medium text-muted-foreground">
            Storage fee
          </p>
          <p className="text-3xl font-semibold tracking-[-0.03em] tabular-nums">
            ${collected.fee}
          </p>
          <dl className="flex flex-col gap-1 pt-2 text-label text-muted-foreground">
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
          <p className="pt-2 text-label text-muted-foreground">
            A part day counts as a whole one.
          </p>
        </div>

        <p className="text-label text-muted-foreground">
          Close the door when you are done. The locker is free for the next
          delivery straight away, and this code will not work again.
        </p>

        <p className="border-t border-border pt-4 text-label text-muted-foreground">
          This collection is confirmed here on screen. A production build would
          also email a verification link to the recipient — outside the scope of
          this build.
        </p>
      </section>
    )
  }

  return (
    <form
      className="flex flex-1 flex-col justify-between gap-8"
      // `mutate`, not `mutateAsync`: handleSubmit would surface the rejection
      // as an unhandledRejection even though the form renders the error state.
      onSubmit={handleSubmit(({ pickupCode }) =>
        collect.mutate(pickupCode, { onSuccess: setCollected })
      )}
      noValidate
    >
      <div className="flex flex-col gap-6">
        {DEMO_MODE && (
          <DemoParcels
            onUse={(code) =>
              setValue("pickupCode", code, { shouldValidate: true })
            }
          />
        )}

        {collect.isError && (
          // The advice never says what was wrong with the code — that leaks.
          <FormAlert
            message={collect.error.message}
            advice="Check the code and try again."
          />
        )}

        <Field data-invalid={errors.pickupCode !== undefined}>
          <FieldLabel className={FIELD_LABEL} htmlFor="pickupCode">
            Pickup code
          </FieldLabel>
          <Controller
            control={control}
            name="pickupCode"
            render={({ field }) => (
              // `inputMode="text"`, not `numeric`: the alphabet has letters.
              // Pattern is the domain alphabet, not REGEXP_ONLY_DIGITS_AND_CHARS,
              // which admits the six characters (0 1 I L O U) the alphabet excludes.
              <InputOTP
                maxLength={PICKUP_CODE_LENGTH}
                inputMode="text"
                pattern={ALPHABET_PATTERN}
                autoComplete="one-time-code"
                autoCapitalize="characters"
                containerClassName="justify-start"
                value={field.value}
                // Upper-cased as typed: `autoCapitalize` is only a hint desktops ignore.
                onChange={(value: string) =>
                  field.onChange(value.toUpperCase())
                }
                onBlur={field.onBlur}
                id="pickupCode"
                aria-describedby="pickupCodeHint"
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
          <p id="pickupCodeHint" className="text-label text-muted-foreground">
            Letters and numbers. There is no O, I, L, U, zero or one in a code —
            if you see one, it is a similar-looking character.
          </p>
          {errors.pickupCode && (
            <FieldError className={FIELD_ERROR}>
              {errors.pickupCode.message}
            </FieldError>
          )}
        </Field>
      </div>

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
