import { z } from "zod"

import { parseBody, toHttpResponse, toServerFailure } from "@dtos/http-error"
import { toStoredPackageDto } from "@dtos/package"
import { isErr } from "@domain/shared/result"
import { guards, storePackage } from "@infrastructure/container"
import { toResponse } from "@infrastructure/external/auth/guard"

const storeSchema = z.object({
  stationId: z.uuid("stationId must be a uuid"),
  recipient: z.object({
    // Message on the type check too: a missing field otherwise reads
    // "expected string, received undefined".
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

/** Guard, validate, delegate, map — the behaviour lives in `StorePackageService`. */
export async function POST(request: Request) {
  // Roles are checked, not ranked: "agent", not admin-or-above.
  const session = await guards.requireRole(request.headers, "agent")
  if (isErr(session)) return toResponse(session.error)

  const command = await parseBody(request, storeSchema)
  if (!command.ok) return command.response

  // A `Result` maps to a status; a throw (code space exhausted, vanished
  // locker) must reach the log, not the client via Next's error page.
  try {
    const stored = await storePackage.execute({
      ...command.data,
      recipient: {
        ...command.data.recipient,
        phone: command.data.recipient.phone ?? null,
      },
      // `stored_by` is a domain fact: the agent is answerable for the parcel.
      audit: { actingUserId: session.value.user.id },
    })

    if (isErr(stored)) return toHttpResponse(stored.error)

    // The code is in this response and nowhere else afterwards.
    return Response.json(toStoredPackageDto(stored.value), { status: 201 })
  } catch (thrown) {
    return toServerFailure(thrown)
  }
}
