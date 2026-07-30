import { z } from "zod"

import { errorResponse, toHttpResponse } from "@dtos/http-error"
import { toLockerDto } from "@dtos/master-data"
import { isErr } from "@domain/shared/result"
import { toResponse } from "@infrastructure/external/auth/guard"
import { guards, installLocker, lockers } from "@infrastructure/container"

/**
 * A station id reaches this handler as text from a query string, and every
 * value in the database is a uuid. Letting a non-uuid through means Postgres
 * answers "invalid input syntax", which surfaces as a 500 — the server
 * reporting a fault for what is a caller's typo.
 */
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

  // No station named: every locker in the network, which is what an admin
  // landing on the page before choosing a station wants to see.
  return Response.json(
    (await lockers.findAllWithAvailability()).map(toLockerDto)
  )
}

export async function POST(request: Request) {
  // Creating a locker is an administrator's job. An agent stores packages in
  // lockers; installing one is a different question and a different role.
  const session = await guards.requireRole(request.headers, "admin")
  if (isErr(session)) return toResponse(session.error)

  const body = await request.json().catch(() => null)
  const details = createLockerSchema.safeParse(body)

  if (!details.success) {
    return badRequest(details.error.issues[0].message)
  }

  // Whether the size exists, whether the station exists and whether the label is
  // free are all decisions about the estate, so they belong to the domain. This
  // handler only says which status each answer becomes.
  const installed = await installLocker.install({
    ...details.data,
    audit: { actingUserId: session.value.user.id },
  })

  if (isErr(installed)) return toHttpResponse(installed.error)

  return Response.json(toLockerDto(installed.value), { status: 201 })
}
