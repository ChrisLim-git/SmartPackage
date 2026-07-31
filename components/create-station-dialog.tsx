"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/** The same shape the route validates. Both sides reject the same thing. */
const schema = z.object({
  name: z.string().trim().min(1, "A name is required").max(120),
  address: z.string().trim().min(1, "An address is required").max(240),
})

type FormValues = z.infer<typeof schema>

/**
 * No uniqueness check on the name, deliberately — there is no unique index on
 * it, and two stations may share a name.
 */
export const CreateStationDialog = ({
  onCreate,
}: {
  onCreate: (details: FormValues) => Promise<unknown>
}) => {
  const [open, setOpen] = useState(false)
  const {
    handleSubmit,
    register,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", address: "" },
  })

  const submit = handleSubmit(async (values) => {
    try {
      await onCreate(values)
      reset()
      setOpen(false)
    } catch (error) {
      // Reported on the name, the field an operator would revisit.
      setError("name", {
        message:
          error instanceof Error
            ? error.message
            : "The station was not registered.",
      })
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Add station</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add a station</DialogTitle>
            <DialogDescription>
              Add lockers to it next — a station with none accepts no packages.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                placeholder="Central Mall"
                autoComplete="off"
                {...register("name")}
              />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Input
                id="address"
                placeholder="180 Bourke Street, Melbourne"
                autoComplete="off"
                {...register("address")}
              />
              {errors.address && (
                <FieldError>{errors.address.message}</FieldError>
              )}
            </Field>
          </div>

          <DialogFooter>
            {/* A named way out, not just Esc and the X. */}
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add station"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
