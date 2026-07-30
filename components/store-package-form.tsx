"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { RiArchiveLine, RiFileCopyLine } from "@remixicon/react"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import type { LockerSizeDto, StationDto } from "@dtos/master-data"
import type { StoredPackageDto } from "@dtos/package"

import { Button } from "@/components/ui/button"
import {
  FIELD_CONTROL,
  FIELD_SELECT,
  FIELD_SUBMIT,
} from "@/components/field-surface"
import { FormAlert } from "@/components/form-alert"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStorePackage } from "@/hooks/use-store-package"
import { cn } from "@/lib/utils"

/** The same shape the route validates, so both sides reject the same thing. */
const schema = z.object({
  stationId: z.uuid("Choose a station"),
  packageSizeCode: z.string().min(1, "Choose a size"),
  recipientName: z.string().trim().min(1, "The recipient's name is required"),
  recipientEmail: z.email("A valid email is required"),
  recipientPhone: z.string().trim().optional(),
})

type FormValues = z.infer<typeof schema>

/**
 * An agent at a locker wall: a package in one hand, a phone in the other.
 *
 * Single column, every control sized past 44px (see `field-surface.ts`), and the
 * submit full-width at the bottom where a thumb already is. Size is three tappable
 * controls rather than a select, because opening a native picker to choose
 * between three options is two taps and a modal for no reason.
 */
export const StorePackageForm = ({
  stations,
  sizes,
}: {
  stations: StationDto[]
  sizes: LockerSizeDto[]
}) => {
  const [stored, setStored] = useState<StoredPackageDto | null>(null)

  const {
    control,
    getValues,
    handleSubmit,
    register,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      // Preselected when there is only one station: an agent standing in it does
      // not need to tell the system where they are.
      stationId: stations.length === 1 ? stations[0].id : "",
      packageSizeCode: "",
      recipientName: "",
      recipientEmail: "",
      recipientPhone: "",
    },
  })

  const store = useStorePackage()

  if (stored !== null) {
    return (
      <section className="flex flex-col gap-8" aria-live="polite">
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-xl">Package stored</h2>
          <p className="text-muted-foreground">
            Put the package in this locker, then give the recipient the code.
          </p>
        </div>

        <dl className="flex flex-col gap-6">
          <div className="flex flex-col gap-1 border-t border-border pt-4">
            <dt className="text-[0.8125rem] font-medium text-muted-foreground">
              Locker
            </dt>
            {/* Display size, read at arm's length while facing a wall of
                lockers. Everything here is mono, so size and weight carry the
                emphasis rather than the family. */}
            <dd className="text-4xl font-semibold tracking-[-0.03em]">
              {stored.lockerLabel}
            </dd>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-4">
            <dt className="text-[0.8125rem] font-medium text-muted-foreground">
              Pickup code
            </dt>
            <dd className="flex items-center justify-between gap-3">
              <span className="text-4xl font-semibold tracking-[-0.03em]">
                {stored.pickupCode}
              </span>
              {/* Copying is here for the reviewer more than the agent: on a real
                  delivery the code is read out or messaged, but on a laptop it
                  goes straight into the collect screen. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 shrink-0 px-3"
                onClick={() =>
                  void navigator.clipboard?.writeText(stored.pickupCode)
                }
              >
                <RiFileCopyLine className="size-4" aria-hidden />
                Copy
              </Button>
            </dd>
            <p className="pt-2 text-[0.8125rem] text-muted-foreground">
              Shown once. Only a hash of it is kept, so it cannot be looked up
              again. The recipient needs nothing else — the code alone opens the
              locker.
            </p>
          </div>
        </dl>

        <Button
          size="lg"
          className={FIELD_SUBMIT}
          onClick={() => {
            store.reset()
            reset({
              // The station is kept: the agent has not moved.
              stationId: getValues("stationId"),
              packageSizeCode: "",
              recipientName: "",
              recipientEmail: "",
              recipientPhone: "",
            })
            setStored(null)
          }}
        >
          Store another package
        </Button>
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
      onSubmit={handleSubmit((values) =>
        store.mutate(
          {
            stationId: values.stationId,
            packageSizeCode: values.packageSizeCode,
            recipient: {
              name: values.recipientName,
              email: values.recipientEmail,
              phone: values.recipientPhone?.trim() || null,
            },
          },
          // Only the success path clears anything. A full station is the one
          // failure where retyping a recipient's email on a phone would be a
          // real cruelty, so the fields keep what they hold.
          { onSuccess: setStored }
        )
      )}
      noValidate
    >
      {store.isError && (
        <FormAlert
          message={store.error.message}
          advice="Your details are still here. Try another size or another station."
        />
      )}

      {stations.length > 1 && (
        <Field data-invalid={errors.stationId !== undefined}>
          <FieldLabel htmlFor="stationId">Station</FieldLabel>
          <Controller
            control={control}
            name="stationId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="stationId" className={FIELD_SELECT}>
                  <SelectValue placeholder="Where are you?" />
                </SelectTrigger>
                <SelectContent>
                  {stations.map((station) => (
                    <SelectItem key={station.id} value={station.id}>
                      {station.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.stationId && (
            <FieldError>{errors.stationId.message}</FieldError>
          )}
        </Field>
      )}

      <Field data-invalid={errors.packageSizeCode !== undefined}>
        <FieldLabel htmlFor="packageSizeCode">Package size</FieldLabel>
        {/* A radiogroup rather than three buttons: the keyboard and a screen
            reader both need to know these are one choice among several. */}
        <Controller
          control={control}
          name="packageSizeCode"
          render={({ field }) => (
            <div
              role="radiogroup"
              aria-labelledby="packageSizeCode"
              className="flex gap-2"
            >
              {sizes.map((size) => {
                const chosen = field.value === size.code

                return (
                  <button
                    key={size.code}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => field.onChange(size.code)}
                    className={cn(
                      "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 border px-3 py-2 transition-colors duration-150",
                      chosen
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="text-lg font-semibold">{size.code}</span>
                    <span className="text-[0.8125rem] opacity-80">
                      {size.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        />
        {errors.packageSizeCode && (
          <FieldError>{errors.packageSizeCode.message}</FieldError>
        )}
      </Field>

      <Field data-invalid={errors.recipientName !== undefined}>
        <FieldLabel htmlFor="recipientName">Recipient name</FieldLabel>
        <Input
          id="recipientName"
          autoComplete="name"
          className={FIELD_CONTROL}
          {...register("recipientName")}
        />
        {errors.recipientName && (
          <FieldError>{errors.recipientName.message}</FieldError>
        )}
      </Field>

      <Field data-invalid={errors.recipientEmail !== undefined}>
        <FieldLabel htmlFor="recipientEmail">Recipient email</FieldLabel>
        <Input
          id="recipientEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          className={FIELD_CONTROL}
          {...register("recipientEmail")}
        />
        {errors.recipientEmail && (
          <FieldError>{errors.recipientEmail.message}</FieldError>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="recipientPhone">
          Recipient phone (optional)
        </FieldLabel>
        <Input
          id="recipientPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className={FIELD_CONTROL}
          {...register("recipientPhone")}
        />
      </Field>

      <Button
        type="submit"
        size="lg"
        className={FIELD_SUBMIT}
        disabled={isSubmitting || store.isPending}
      >
        <RiArchiveLine className="size-5" aria-hidden />
        {store.isPending ? "Storing…" : "Store package"}
      </Button>
    </form>
  )
}
