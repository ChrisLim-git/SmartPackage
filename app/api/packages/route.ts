import { z } from "zod"

import { errorResponse, toHttpResponse } from "@dtos/http-error"
import { toStoredPackageDto } from "@dtos/package"
import { isErr } from "@domain/shared/result"
import { guards, storePackage } from "@infrastructure/container"
import { toResponse } from "@infrastructure/external/auth/guard"

const storeSchema = z.object({
  stationId: z.uuid("stationId must be a uuid"),
  recipient: z.object({
    // The message is given to the type check as well as the length check: a
    // field left out entirely is the same mistake as one left blank, and Zod's
    // default for the former reads "expected string, received undefined".
    name: z
      .string("a recipient name is required")
      .trim()
      .min(1, "a recipient name is required"),
    email: z.email("a recipient email is required"),
    phone: z.string().trim().min(1).nullish(),
  }),
  packageSizeCode: z
    .string("a package size is required")
    .trim()
    .min(1, "a package size is required"),
})

/**
 * An agent hands a parcel over and gets back a locker and a code.
 *
 * Guard, validate, delegate, map — the handler holds no behaviour. Which locker
 * the parcel goes in, whether anything fits, and what the recipient's record
 * becomes are all `StorePackageService`, tested against in-memory repositories in
 * microseconds. This layer owns the status code and the wire shape.
 */
export async function POST(request: Request) {
  // An agent's job, not an administrator's: installing lockers and filling them
  // are different questions, and roles here are checked rather than ranked.
  const session = await guards.requireRole(request.headers, "agent")
  if (isErr(session)) return toResponse(session.error)

  const body = await request.json().catch(() => null)
  const command = storeSchema.safeParse(body)

  if (!command.success) {
    return errorResponse("MalformedInput", command.error.issues[0].message, 400)
  }

  const stored = await storePackage.execute({
    ...command.data,
    recipient: {
      ...command.data.recipient,
      phone: command.data.recipient.phone ?? null,
    },
    // The agent is answerable for the parcel, which is a domain fact rather than
    // an audit stamp — `stored_by` on the row.
    audit: { actingUserId: session.value.user.id },
  })

  if (isErr(stored)) return toHttpResponse(stored.error)

  // 201: a parcel now exists that did not before. The code is in this response
  // and nowhere else afterwards.
  return Response.json(toStoredPackageDto(stored.value), { status: 201 })
}
