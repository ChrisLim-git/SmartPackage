import { z } from "zod"

import { errorResponse, toHttpResponse } from "@dtos/http-error"
import { toCollectedPackageDto } from "@dtos/package"
import { isErr } from "@domain/shared/result"
import { collectPackage } from "@infrastructure/container"

const pickupSchema = z.object({
  stationId: z.uuid("stationId must be a uuid"),
  lockerLabel: z
    .string("a locker label is required")
    .trim()
    .min(1, "a locker label is required"),
  // Shape is checked by the domain, not here: `PickupCode` owns "six digits",
  // and duplicating the rule in a Zod schema would leave two definitions of a
  // valid code that could drift apart.
  pickupCode: z.string("a pickup code is required").trim(),
})

/**
 * The public one.
 *
 * No guard, deliberately: a recipient collecting a parcel has no account, and
 * requiring one would mean a delivery to someone who has never used the service
 * cannot be collected. The code is the credential — six digits, held only as a
 * peppered hash, and the reason every rejection answers identically.
 *
 * It is public by construction rather than by configuration: BetterAuth owns only
 * `/api/auth/*` and installs no middleware. If a `proxy.ts` is ever added, its
 * matcher must exclude this path — a broad matcher would swallow the public route
 * and break collection in the least obvious way.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const command = pickupSchema.safeParse(body)

  if (!command.success) {
    return errorResponse("MalformedInput", command.error.issues[0].message, 400)
  }

  const collected = await collectPackage.execute({
    ...command.data,
    // No acting user, and that is the honest value: nobody signed in to open
    // this locker. The parcel records who stored it, never who took it.
    audit: { actingUserId: null },
  })

  if (isErr(collected)) return toHttpResponse(collected.error)

  return Response.json(toCollectedPackageDto(collected.value))
}
