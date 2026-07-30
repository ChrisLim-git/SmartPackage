"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import type { LockerSizeDto, StationDto } from "@dtos/master-data"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** The same shape the route validates. Both sides reject the same thing. */
const schema = z.object({
  stationId: z.uuid("Choose a station"),
  sizeCode: z.string().min(1, "Choose a size"),
  label: z.string().trim().min(1, "A label is required"),
})

type FormValues = z.infer<typeof schema>

/**
 * `field` plus react-hook-form's own `<Controller />`.
 *
 * Not `<Form>/<FormField>/<FormMessage>` — `shadcn add form` writes no files in
 * 4.x, and every tutorial showing those components predates it.
 */
export const CreateLockerDialog = ({
  stations,
  sizes,
  disabled = false,
  onCreate,
}: {
  stations: StationDto[]
  sizes: LockerSizeDto[]
  /** Set when the stations or the sizes are missing — the two dropdowns would have nothing in them. */
  disabled?: boolean
  onCreate: (details: FormValues) => Promise<unknown>
}) => {
  const [open, setOpen] = useState(false)
  const {
    control,
    handleSubmit,
    register,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { stationId: "", sizeCode: "", label: "" },
  })

  const submit = handleSubmit(async (values) => {
    try {
      await onCreate(values)
      reset()
      setOpen(false)
    } catch (error) {
      // A duplicate label is a fact about the label, so it is reported on the
      // label — not thrown at the user as a toast that says "Error".
      setError("label", {
        message:
          error instanceof Error
            ? error.message
            : "The locker was not created.",
      })
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>Add locker</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add a locker</DialogTitle>
            <DialogDescription>
              It becomes available for packages immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <Controller
              control={control}
              name="stationId"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="stationId">Station</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="stationId" className="w-full">
                      <SelectValue placeholder="Choose a station" />
                    </SelectTrigger>
                    <SelectContent>
                      {stations.map((station) => (
                        <SelectItem key={station.id} value={station.id}>
                          {station.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.stationId && (
                    <FieldError>{errors.stationId.message}</FieldError>
                  )}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="sizeCode"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="sizeCode">Size</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="sizeCode" className="w-full">
                      <SelectValue placeholder="Choose a size" />
                    </SelectTrigger>
                    <SelectContent>
                      {sizes.map((size) => (
                        <SelectItem key={size.code} value={size.code}>
                          {size.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.sizeCode && (
                    <FieldError>{errors.sizeCode.message}</FieldError>
                  )}
                </Field>
              )}
            />

            <Field>
              <FieldLabel htmlFor="label">Label</FieldLabel>
              <Input
                id="label"
                placeholder="A1"
                autoComplete="off"
                {...register("label")}
              />
              {errors.label && <FieldError>{errors.label.message}</FieldError>}
            </Field>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add locker"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
