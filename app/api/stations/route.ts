import { z } from "zod"

import { errorResponse, toHttpResponse } from "@dtos/http-error"
import { toStationDto } from "@dtos/master-data"
import { toResponse } from "@infrastructure/external/auth/guard"
import { guards, registerStation, stations } from "@infrastructure/container"
import { isErr } from "@domain/shared/result"

/**
 * Length caps are the schema's business, not the entity's. `Station` refuses an
 * empty name because a station without one is meaningless; a 500-character name
 * is a well-formed value that no column should have to hold, which is a
 * transport concern.
 */
const createStationSchema = z.object({
  name: z.string().trim().min(1, "a name is required").max(120),
  address: z.string().trim().min(1, "an address is required").max(240),
})

/**
 * Route Handlers rather than Server Actions, throughout the API.
 *
 * Server Actions are queued — they run one at a time per client — which turns
 * parallel reads into a line. They are also mutation-shaped, and TanStack Query
 * wants real endpoints it can key and invalidate.
 */
export async function GET(request: Request) {
  const session = await guards.requireSession(request.headers)
  if (isErr(session)) return toResponse(session.error)

  const found = await stations.findAll()

  return Response.json(found.map(toStationDto))
}

export async function POST(request: Request) {
  // An administrator's job, the same as installing a locker. An agent works at
  // a station; deciding there should be one is a different question.
  const session = await guards.requireRole(request.headers, "admin")
  if (isErr(session)) return toResponse(session.error)

  const body = await request.json().catch(() => null)
  const details = createStationSchema.safeParse(body)

  if (!details.success) {
    return errorResponse("MalformedInput", details.error.issues[0].message, 400)
  }

  const registered = await registerStation.register({
    ...details.data,
    audit: { actingUserId: session.value.user.id },
  })

  if (isErr(registered)) return toHttpResponse(registered.error)

  return Response.json(toStationDto(registered.value), { status: 201 })
}
