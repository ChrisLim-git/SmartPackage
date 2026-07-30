import { toLockerSizeDto } from "@application/dto/master-data"
import { isErr } from "@domain/shared/result"
import { toResponse } from "@infrastructure/auth/guard"
import { guards, lockerSizes } from "@infrastructure/container"

export async function GET(request: Request) {
  const session = await guards.requireSession(request.headers)
  if (isErr(session)) return toResponse(session.error)

  const found = await lockerSizes.findAll()

  return Response.json(found.map(toLockerSizeDto))
}
