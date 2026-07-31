"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { RiArchiveLine, RiFileCopyLine } from "@remixicon/react"
import { useRef, useState, useSyncExternalStore } from "react"
import type * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import type { LockerSizeDto, StationDto } from "@dtos/master-data"
import type { StoredPackageDto } from "@dtos/package"

import { Button } from "@/components/ui/button"
import {
  FIELD_CONTROL,
  FIELD_ERROR,
  FIELD_LABEL,
  FIELD_SELECT,
  FIELD_SELECT_ITEM,
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

/** Response plus station name — locker labels are only unique within a station. */
type StoredResult = StoredPackageDto & { stationName: string }

// The system keeps only a hash of the code, so the result must survive an
// interruption (lock screen, back gesture). sessionStorage, not localStorage:
// outlives an interruption, not a shift; cleared when the next package starts.
const HELD_RESULT_KEY = "smartpackage.agent.lastStored"

/**
 * `shared` travels with the result rather than beside it: whether the agent has
 * passed the code on gates the destructive action, so it has to survive the same
 * interruptions the code does. Stored-then-called-away comes back to a closed
 * gate.
 */
type HeldResult = StoredResult & { shared: boolean }

const readHeld = (): HeldResult | null => {
  try {
    const raw = sessionStorage.getItem(HELD_RESULT_KEY)

    return raw === null ? null : (JSON.parse(raw) as HeldResult)
  } catch {
    // Storage unavailable or stale shape: fall back to in-memory only.
    return null
  }
}

// sessionStorage as an external store. Not useState + useEffect (reading storage
// in an effect and calling setState is a cascading render) and not a lazy
// initialiser (the server has no storage, so that is a hydration mismatch).
// useSyncExternalStore is the hook for exactly this: null on the server,
// whatever the tab holds on the client, reconciled by React.
let held: HeldResult | null | undefined
const listeners = new Set<() => void>()

const heldStore = {
  subscribe: (listener: () => void) => {
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  },
  getSnapshot: (): HeldResult | null => {
    if (held === undefined) {
      held = readHeld()
    }

    return held
  },
  getServerSnapshot: (): HeldResult | null => null,
  set: (result: HeldResult | null) => {
    held = result

    try {
      if (result === null) {
        sessionStorage.removeItem(HELD_RESULT_KEY)
      } else {
        sessionStorage.setItem(HELD_RESULT_KEY, JSON.stringify(result))
      }
    } catch {
      // Storage unavailable degrades the guarantee, not the flow: the result
      // still lives in `held` for as long as the page does.
    }

    listeners.forEach((listener) => listener())
  },
}

/**
 * Size tiles as a radiogroup: one tab stop, arrows move within. When nothing is
 * chosen the first tile holds the tab stop so the group stays reachable.
 */
const SizeRadioGroup = ({
  sizes,
  value,
  onChange,
  onBlur,
}: {
  sizes: LockerSizeDto[]
  value: string
  onChange: (code: string) => void
  onBlur: () => void
}) => {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const selected = sizes.findIndex((size) => size.code === value)

  const move = (to: number) => {
    const index = (to + sizes.length) % sizes.length
    onChange(sizes[index].code)
    refs.current[index]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const from = selected === -1 ? 0 : selected

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        return move(from + 1)
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        return move(from - 1)
      case "Home":
        event.preventDefault()
        return move(0)
      case "End":
        event.preventDefault()
        return move(sizes.length - 1)
    }
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby="packageSizeLabel"
      className="flex gap-2"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {sizes.map((size, index) => {
        const chosen = value === size.code

        return (
          <button
            key={size.code}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen || (selected === -1 && index === 0) ? 0 : -1}
            onClick={() => onChange(size.code)}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 border px-3 py-2 transition-colors duration-150",
              "outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              chosen
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            )}
          >
            <span className="text-lg font-semibold">{size.code}</span>
            <span className="text-label opacity-80">{size.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** One-handed mobile form: single column, 44px+ controls (see `field-surface.ts`). */
export const StorePackageForm = ({
  stations,
  sizes,
  agentEmail,
}: {
  stations: StationDto[]
  sizes: LockerSizeDto[]
  agentEmail: string
}) => {
  const stored = useSyncExternalStore(
    heldStore.subscribe,
    heldStore.getSnapshot,
    heldStore.getServerSnapshot
  )
  const [copied, setCopied] = useState(false)

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
      // Preselect the only station.
      stationId: stations.length === 1 ? stations[0].id : "",
      packageSizeCode: "",
      recipientName: "",
      recipientEmail: "",
      recipientPhone: "",
    },
  })

  const store = useStorePackage()

  if (stored !== null) {
    const startNext = () => {
      heldStore.set(null)
      store.reset()
      reset({
        // The station is kept: the agent has not moved.
        stationId: getValues("stationId"),
        packageSizeCode: "",
        recipientName: "",
        recipientEmail: "",
        recipientPhone: "",
      })
      setCopied(false)
    }

    const markShared = () => heldStore.set({ ...stored, shared: true })

    return (
      <section className="flex flex-1 flex-col justify-between gap-10">
        {/* One-sentence announcement — aria-live on the whole block read out everything. */}
        <p className="sr-only" role="status">
          Locker {stored.lockerLabel} assigned at {stored.stationName}. Pickup
          code {stored.pickupCode.split("").join(" ")}.
        </p>

        <div className="flex flex-col gap-8">
          <div className="flex animate-result flex-col gap-2">
            <h1 className="font-heading text-2xl">Locker assigned</h1>
            <p className="text-muted-foreground">
              Put the package in it, then give the recipient the code.
            </p>
          </div>

          <div className="flex animate-result flex-col gap-1 border-t border-border pt-5">
            <p className="text-label font-medium text-muted-foreground">
              {stored.stationName}
            </p>
            <p className="text-6xl font-semibold tracking-[-0.03em] tabular-nums">
              {stored.lockerLabel}
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <p className="text-label font-medium text-muted-foreground">
              Pickup code
            </p>
            <p className="text-4xl font-semibold tracking-[0.05em] tabular-nums">
              {stored.pickupCode}
            </p>
            <p className="text-label text-muted-foreground">
              Shown once. Only a hash of it is kept, so it cannot be looked up
              again. The recipient needs nothing else — the code alone opens the
              locker.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            type="button"
            size="lg"
            className={FIELD_SUBMIT}
            onClick={async () => {
              try {
                await navigator.clipboard?.writeText(stored.pickupCode)
                setCopied(true)
                markShared()
              } catch {
                // Clipboard can be refused; failing silently would imply they
                // have the code, so the gate stays shut.
                setCopied(false)
              }
            }}
          >
            <RiFileCopyLine className="size-5" aria-hidden />
            {copied ? "Code copied" : "Copy code"}
          </Button>

          {stored.shared ? (
            /* Deliberately outline: this destroys the only copy of the code. */
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={FIELD_SUBMIT}
              onClick={startNext}
            >
              <RiArchiveLine className="size-5" aria-hidden />
              Store another package
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className={FIELD_SUBMIT}
              onClick={markShared}
            >
              I have passed the code on
            </Button>
          )}
        </div>
      </section>
    )
  }

  return (
    <form
      className="flex flex-1 flex-col gap-6"
      // `mutate`, not `mutateAsync`: handleSubmit would surface the rejection
      // as an unhandledRejection even though the form renders the error state.
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
          // Only success clears the fields; failures keep what was typed.
          {
            onSuccess: (result) => {
              heldStore.set({
                ...result,
                stationName:
                  stations.find((station) => station.id === values.stationId)
                    ?.name ?? "",
                // The gate starts shut: the code has not left this screen yet.
                shared: false,
              })
            },
          }
        )
      )}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl">Store a package</h1>
        <p className="text-label text-muted-foreground">{agentEmail}</p>
      </div>

      {store.isError && (
        <FormAlert
          message={store.error.message}
          advice="Your details are still here. Try another size or another station."
        />
      )}

      {stations.length > 1 && (
        <Field data-invalid={errors.stationId !== undefined}>
          <FieldLabel className={FIELD_LABEL} htmlFor="stationId">
            Station
          </FieldLabel>
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
                    <SelectItem
                      key={station.id}
                      value={station.id}
                      className={FIELD_SELECT_ITEM}
                    >
                      {station.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.stationId && (
            <FieldError className={FIELD_ERROR}>
              {errors.stationId.message}
            </FieldError>
          )}
        </Field>
      )}

      <Field data-invalid={errors.packageSizeCode !== undefined}>
        {/* `id`, not `htmlFor`: the radiogroup's aria-labelledby needs a real
            element id, and htmlFor renders as `for`. */}
        <FieldLabel className={FIELD_LABEL} id="packageSizeLabel">
          Package size
        </FieldLabel>
        <Controller
          control={control}
          name="packageSizeCode"
          render={({ field }) => (
            <SizeRadioGroup
              sizes={sizes}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        {errors.packageSizeCode && (
          <FieldError className={FIELD_ERROR}>
            {errors.packageSizeCode.message}
          </FieldError>
        )}
      </Field>

      <Field data-invalid={errors.recipientName !== undefined}>
        <FieldLabel className={FIELD_LABEL} htmlFor="recipientName">
          Recipient name
        </FieldLabel>
        <Input
          id="recipientName"
          autoComplete="name"
          className={FIELD_CONTROL}
          {...register("recipientName")}
        />
        {errors.recipientName && (
          <FieldError className={FIELD_ERROR}>
            {errors.recipientName.message}
          </FieldError>
        )}
      </Field>

      <Field data-invalid={errors.recipientEmail !== undefined}>
        <FieldLabel className={FIELD_LABEL} htmlFor="recipientEmail">
          Recipient email
        </FieldLabel>
        <Input
          id="recipientEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          className={FIELD_CONTROL}
          {...register("recipientEmail")}
        />
        {errors.recipientEmail && (
          <FieldError className={FIELD_ERROR}>
            {errors.recipientEmail.message}
          </FieldError>
        )}
      </Field>

      <Field>
        <FieldLabel className={FIELD_LABEL} htmlFor="recipientPhone">
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
