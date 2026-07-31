import { eq } from "drizzle-orm"
import { z } from "zod"

import { parseBody, toServerFailure } from "@dtos/http-error"
import { isErr } from "@domain/shared/result"
import { StorePackageService } from "@domain/services/store-package-service"
import { PickupCode } from "@domain/utils/pickup-code"
import { db } from "@infrastructure/database/client"
import { locker } from "@infrastructure/database/schema/locker"
import { packageTable } from "@infrastructure/database/schema/package"
import { user } from "@infrastructure/database/schema/auth-schema"
import {
  codes,
  hasher,
  ids,
  lockerSizes,
  stations,
  uow,
} from "@infrastructure/container"

import { DEMO_MODE } from "@/lib/demo-mode"

/**
 * Mints test parcels through the real store service and keeps the plaintext code
 * in memory. Existing parcels cannot be listed: only their hash is persisted.
 */
type Minted = {
  pickupCode: string
  pickupCodeHash: string
  lockerLabel: string
  stationName: string
  recipientName: string
  storedAt: string
  daysAgo: number
}

const minted: Minted[] = []

// 404, not 403: in production this route should not appear to exist.
const notFound = () => new Response(null, { status: 404 })

/** Named so a test parcel is never mistaken for a real one. */
const RECIPIENTS = [
  "Test Recipient",
  "Demo Customer",
  "Sample Addressee",
  "Trial Collector",
]

const DAY_MS = 24 * 60 * 60 * 1000

const mintSchema = z.object({
  // 30 days is past the last fee tier, which is as far as a reviewer needs.
  daysAgo: z.number().int().min(0).max(30).optional(),
})

const conflict = (code: string, message: string) =>
  Response.json({ error: { code, message } }, { status: 409 })

const seedFirst = "Seed the database first: pnpm db:seed."

export async function GET() {
  if (!DEMO_MODE) return notFound()

  try {
    if (minted.length === 0) return Response.json([])

    // Drop codes already collected, so the list only shows usable ones.
    const rows = await db
      .select({
        hash: packageTable.pickupCodeHash,
        status: packageTable.status,
      })
      .from(packageTable)

    const live = new Set(
      rows.filter((row) => row.status === "stored").map((row) => row.hash)
    )

    return Response.json(
      minted
        .filter((parcel) => live.has(parcel.pickupCodeHash))
        .map(({ pickupCodeHash: _hash, ...rest }) => rest)
        .reverse()
    )
  } catch (thrown) {
    return toServerFailure(thrown)
  }
}

export async function POST(request: Request) {
  if (!DEMO_MODE) return notFound()

  const command = await parseBody(request, mintSchema)
  if (!command.ok) return command.response

  const daysAgo = command.data.daysAgo ?? 0

  try {
    // First station, smallest size: this button hands over a parcel, not a choice.
    const [station] = await stations.findAll()
    if (station === undefined) return conflict("NoStations", seedFirst)

    const sizes = await lockerSizes.findAll()
    const smallest = [...sizes].sort((a, b) => a.rank - b.rank)[0]
    if (smallest === undefined) return conflict("NoSizes", seedFirst)

    // Attributed to the seeded agent: `stored_by` is required.
    const [agent] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "agent@smartpackage.test"))
      .limit(1)
    if (agent === undefined) return conflict("NoAgent", seedFirst)

    // Backdating goes through the service's own clock rather than editing
    // `stored_at` afterwards, so the fee is computed from a real stay.
    const backdated = { now: () => new Date(Date.now() - daysAgo * DAY_MS) }

    const service = new StorePackageService({
      stations,
      lockerSizes,
      codes,
      hasher,
      ids,
      clock: backdated,
      uow,
    })

    const recipient = RECIPIENTS[minted.length % RECIPIENTS.length]

    const stored = await service.execute({
      stationId: station.id,
      packageSizeCode: smallest.code,
      recipient: {
        name: recipient,
        email: "test@smartpackage.test",
        phone: null,
      },
      audit: { actingUserId: agent.id },
    })

    if (isErr(stored)) {
      // Usually "no free locker of that size" — a real answer, not a fault.
      return conflict(stored.error.code, stored.error.message)
    }

    // Hashed only so GET can tell whether this parcel is still waiting.
    const code = PickupCode.create(stored.value.pickupCode)

    // The service just minted this code, so a rejection here is a broken
    // invariant, not input: fail loudly rather than mint an unlistable parcel.
    if (isErr(code)) throw new Error("Stored a package with an invalid code")

    const parcel: Minted = {
      pickupCode: stored.value.pickupCode,
      pickupCodeHash: hasher.hash(code.value),
      lockerLabel: stored.value.lockerLabel,
      stationName: station.name,
      recipientName: recipient,
      storedAt: stored.value.storedAt.toISOString(),
      daysAgo,
    }

    minted.push(parcel)

    const { pickupCodeHash: _hash, ...body } = parcel

    return Response.json(body, { status: 201 })
  } catch (thrown) {
    return toServerFailure(thrown)
  }
}

/** Deletes every parcel and frees every locker, returning the app to a seeded state. */
export async function DELETE() {
  if (!DEMO_MODE) return notFound()

  try {
    const removed = await db.transaction(async (tx) => {
      const deleted = await tx.delete(packageTable).returning({
        id: packageTable.id,
      })

      await tx
        .update(locker)
        .set({ status: "available" })
        .where(eq(locker.status, "occupied"))

      return deleted.length
    })

    minted.length = 0

    return Response.json({ removed })
  } catch (thrown) {
    return toServerFailure(thrown)
  }
}
