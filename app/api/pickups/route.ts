import { z } from "zod"

import { parseBody, toHttpResponse, toServerFailure } from "@dtos/http-error"
import { toCollectedPackageDto } from "@dtos/package"
import { isErr } from "@domain/shared/result"
import { collectPackage } from "@infrastructure/container"

// The code alone identifies the parcel (partial unique index on the hash).
// Its shape is validated by `PickupCode` in the domain, not restated here.
const pickupSchema = z.object({
  pickupCode: z.string("a pickup code is required").trim(),
})

/**
 * Deliberately unguarded: collection is public and the code is the credential.
 * If a `proxy.ts` is ever added, its matcher must exclude this path.
 */
export async function POST(request: Request) {
  const command = await parseBody(request, pickupSchema)
  if (!command.ok) return command.response

  // Throws are logged in full and answered with nothing — this is the one
  // route an unauthenticated stranger can reach.
  try {
    const collected = await collectPackage.execute({
      ...command.data,
      // Honest null: nobody signed in. The parcel records who stored it, never who took it.
      audit: { actingUserId: null },
    })

    if (isErr(collected)) return toHttpResponse(collected.error)

    return Response.json(toCollectedPackageDto(collected.value))
  } catch (thrown) {
    return toServerFailure(thrown)
  }
}
