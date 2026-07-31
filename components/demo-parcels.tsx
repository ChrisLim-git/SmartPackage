"use client"

import { RiAddLine, RiDeleteBinLine, RiFlaskLine } from "@remixicon/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useDemoParcels } from "@/hooks/use-demo-parcels"
import { useMintDemoParcel } from "@/hooks/use-mint-demo-parcel"
import { useResetDemoParcels } from "@/hooks/use-reset-demo-parcels"

/** Stay lengths that each land in a different fee tier under the seeded pricing. */
const DAY_CHOICES = [0, 1, 3, 7, 14]

/**
 * Mints test parcels and lists their codes, so collection can be tested without
 * running the agent flow first.
 */
export const DemoParcels = ({ onUse }: { onUse: (code: string) => void }) => {
  const [daysAgo, setDaysAgo] = useState(0)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const parcels = useDemoParcels()
  const mint = useMintDemoParcel()
  const reset = useResetDemoParcels()

  const available = parcels.data ?? []
  const busy = mint.isPending || reset.isPending

  return (
    <section
      aria-labelledby="demoParcelsHeading"
      className="flex flex-col gap-3 border border-dashed border-field-border p-4"
    >
      <div className="flex items-start gap-2">
        <RiFlaskLine
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <h2 id="demoParcelsHeading" className="text-label font-medium">
            Demo Mode: Test parcels
          </h2>
          {/* Codes are hashed once issued, so pre-existing parcels cannot be listed. */}
          <p className="text-label text-muted-foreground">
            Create one to get a working code. Only parcels made here can be
            listed — issued codes are stored hashed.
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label text-muted-foreground">
          Stored this long ago — sets the fee on collection
        </legend>
        {/* Backdates the parcel so a stay crosses real fee tiers. */}
        <div className="flex flex-wrap gap-2">
          {DAY_CHOICES.map((days) => {
            const chosen = days === daysAgo

            return (
              <Button
                key={days}
                type="button"
                variant={chosen ? "default" : "outline"}
                aria-pressed={chosen}
                className="h-11 min-w-14 flex-1 px-3 text-base"
                disabled={busy}
                onClick={() => setDaysAgo(days)}
              >
                {days === 0 ? "Today" : `${days}d`}
              </Button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 px-3 text-base"
          onClick={() => {
            setConfirmingReset(false)
            mint.mutate(daysAgo)
          }}
          disabled={busy}
        >
          <RiAddLine className="size-4" aria-hidden />
          {mint.isPending ? "Creating…" : "Create parcel"}
        </Button>
        {/* Two-step, not `title`: this deletes every parcel, and a tooltip is
            invisible on the touch devices this screen is built for. */}
        <Button
          type="button"
          variant={confirmingReset ? "destructive" : "ghost"}
          className="h-11 px-3 text-base"
          onClick={() =>
            confirmingReset
              ? reset.mutate(undefined, {
                  onSettled: () => setConfirmingReset(false),
                })
              : setConfirmingReset(true)
          }
          disabled={busy}
        >
          <RiDeleteBinLine className="size-4" aria-hidden />
          {reset.isPending
            ? "Resetting…"
            : confirmingReset
              ? "Delete every parcel?"
              : "Reset"}
        </Button>
      </div>

      {(mint.isError || reset.isError) && (
        <p role="alert" className="text-label text-destructive">
          {reset.isError ? reset.error.message : mint.error?.message}
        </p>
      )}

      {available.length === 0 ? (
        <p className="text-label text-muted-foreground">
          {parcels.isLoading ? "Loading…" : "No test parcels yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {available.map((parcel) => (
            <li
              key={parcel.pickupCode}
              className="flex items-center justify-between gap-3 border-t border-border pt-2"
            >
              <div className="flex flex-col">
                <span className="text-lg font-semibold tracking-[0.05em] tabular-nums">
                  {parcel.pickupCode}
                </span>
                <span className="text-label text-muted-foreground">
                  Locker {parcel.lockerLabel} ·{" "}
                  {parcel.daysAgo === 0
                    ? "stored today"
                    : `stored ${parcel.daysAgo}d ago`}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 px-3 text-base"
                onClick={() => onUse(parcel.pickupCode)}
              >
                Use
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
