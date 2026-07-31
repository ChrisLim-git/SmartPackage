import { z } from "zod"

import { parseBody, toHttpResponse } from "@dtos/http-error"
import { toStationDto } from "@dtos/master-data"
import { toResponse } from "@infrastructure/external/auth/guard"
import { guards, registerStation, stations } from "@infrastructure/container"
import { isErr } from "@domain/shared/result"

// Length caps are a transport concern; the entity only refuses an empty name.
const createStationSchema = z.object({
  name: z.string().trim().min(1, "a name is required").max(120),
  address: z.string().trim().min(1, "an address is required").max(240),
})

// Route Handlers, not Server Actions: actions queue one-at-a-time per client,
// and TanStack Query wants real endpoints it can key and invalidate.
export async function GET(request: Request) {
  const session = await guards.requireSession(request.headers)
  if (isErr(session)) return toResponse(session.error)

  const found = await stations.findAll()

  return Response.json(found.map(toStationDto))
}

export async function POST(request: Request) {
  const session = await guards.requireRole(request.headers, "admin")
  if (isErr(session)) return toResponse(session.error)

  const details = await parseBody(request, createStationSchema)
  if (!details.ok) return details.response

  const registered = await registerStation.register({
    ...details.data,
    audit: { actingUserId: session.value.user.id },
  })

  if (isErr(registered)) return toHttpResponse(registered.error)

  return Response.json(toStationDto(registered.value), { status: 201 })
}
