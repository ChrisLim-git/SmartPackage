"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { RiAlertLine, RiLockUnlockLine } from "@remixicon/react"
import { QRCodeSVG } from "qrcode.react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import type { CollectedPackageDto } from "@dtos/package"

import { FIELD_SUBMIT } from "@/components/field-surface"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { useCollectPackage } from "@/hooks/use-collect-package"

const schema = z.object({
  pickupCode: z.string().regex(/^\d{6}$/, "Enter all six digits"),
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
              number is followed by the arithmetic behind it. */}
          <p className="pt-2 text-[0.8125rem] text-muted-foreground">
            {collected.chargeableDays === 1
              ? "One day of storage."
              : `${collected.chargeableDays} days of storage.`}{" "}
            The daily rate rises in bands the longer a package stays, and a part
            day counts as a whole one.
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
        <div
          role="alert"
          className="flex items-start gap-3 border border-border bg-muted p-4"
        >
          <RiAlertLine className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-medium">{collect.error.message}</p>
            {/* Helpful without leaking: it does not say what was wrong with the
                code, because that is exactly what an attacker is asking. */}
            <p className="text-[0.8125rem] text-muted-foreground">
              Check the six digits and try again.
            </p>
          </div>
        </div>
      )}

      <Field data-invalid={errors.pickupCode !== undefined}>
        <FieldLabel htmlFor="pickupCode">Pickup code</FieldLabel>
        <Controller
          control={control}
          name="pickupCode"
          render={({ field }) => (
            // Six cells rather than one text input: `inputMode="numeric"` raises
            // a keypad instead of a keyboard, and `one-time-code` lets a phone
            // offer the code straight out of the message it arrived in.
            <InputOTP
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              containerClassName="justify-start"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              id="pickupCode"
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((index) => (
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
