import { z } from "zod"

import { errorResponse, toHttpResponse } from "@dtos/http-error"
import { toCollectedPackageDto } from "@dtos/package"
import { isErr } from "@domain/shared/result"
import { collectPackage } from "@infrastructure/container"

/**
 * The code, and nothing else.
 *
 * No station and no locker number: the recipient has six digits from a message,
 * and the code identifies the parcel on its own — which is what a partial unique
 * index on the hash of a stored parcel's code guarantees.
 *
 * The shape of the code is checked by the domain rather than here. `PickupCode`
 * owns "six digits", and a second definition in a Zod schema is a rule that can
 * drift.
 */
const pickupSchema = z.object({
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
