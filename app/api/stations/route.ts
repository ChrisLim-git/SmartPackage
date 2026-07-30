import { toStationDto } from "@application/dto/master-data"
import { toResponse } from "@infrastructure/auth/guard"
import { guards, stations } from "@infrastructure/container"
import { isErr } from "@domain/shared/result"

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
