import { z } from "zod"

import { errorResponse, parseBody, toHttpResponse } from "@dtos/http-error"
import { toLockerDto } from "@dtos/master-data"
import { isErr } from "@domain/shared/result"
import { toResponse } from "@infrastructure/external/auth/guard"
import { guards, installLocker, lockers } from "@infrastructure/container"

// A non-uuid reaching Postgres surfaces "invalid input syntax" as a 500 for a caller's typo.
const stationIdSchema = z.uuid("stationId must be a uuid")

const createLockerSchema = z.object({
  stationId: z.uuid("stationId must be a uuid"),
  sizeCode: z.string().trim().min(1, "a size code is required"),
  label: z.string().trim().min(1, "a label is required"),
})

const badRequest = (message: string) =>
  errorResponse("MalformedInput", message, 400)

export async function GET(request: Request) {
  const session = await guards.requireSession(request.headers)
  if (isErr(session)) return toResponse(session.error)

  const raw = new URL(request.url).searchParams.get("stationId")

  if (raw !== null) {
    const stationId = stationIdSchema.safeParse(raw)
    if (!stationId.success) {
      return badRequest(stationId.error.issues[0].message)
    }

    return Response.json(
      (await lockers.findAllWithAvailability(stationId.data)).map(toLockerDto)
    )
  }

  // No station named: every locker in the network.
  return Response.json(
    (await lockers.findAllWithAvailability()).map(toLockerDto)
  )
}

export async function POST(request: Request) {
  const session = await guards.requireRole(request.headers, "admin")
  if (isErr(session)) return toResponse(session.error)

  const details = await parseBody(request, createLockerSchema)
  if (!details.ok) return details.response

  // Size/station existence and label uniqueness are domain decisions; this
  // handler only maps each answer to a status.
  const installed = await installLocker.install({
    ...details.data,
    audit: { actingUserId: session.value.user.id },
  })

  if (isErr(installed)) return toHttpResponse(installed.error)

  return Response.json(toLockerDto(installed.value), { status: 201 })
}
