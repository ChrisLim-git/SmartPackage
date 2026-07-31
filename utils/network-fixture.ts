import type { Pool } from "pg"

import type { Db } from "@infrastructure/database/client"
import { customer } from "@infrastructure/database/schema/customer"
import { locker } from "@infrastructure/database/schema/locker"
import { lockerSize } from "@infrastructure/database/schema/locker-size"
import { station } from "@infrastructure/database/schema/station"

/**
 * The smallest network a `package` row's five foreign keys allow. Ids are
 * whatever the database issued, never literals — the columns are `uuid`.
 */
export type Network = {
  agentId: string
  customerId: string
  stationId: string
  sizeIds: Record<string, string>
  lockerIds: Record<string, string>
}

export const SIZES = [
  { code: "S", rank: 1, label: "Small" },
  { code: "M", rank: 2, label: "Medium" },
  { code: "L", rank: 3, label: "Large" },
]

/** How many lockers of each size, defaulting to one apiece. */
export type LockerCounts = Partial<Record<string, number>>

export const seedNetwork = async (
  pool: Pool,
  db: Db,
  counts: LockerCounts = { S: 1, M: 1, L: 1 }
): Promise<Network> => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "user" (name, email, email_verified, created_at, updated_at)
     VALUES ('Ari Agent', 'agent@fixture.test', false, now(), now())
     RETURNING id`
  )
  const agentId = rows[0].id

  const [recipient] = await db
    .insert(customer)
    .values({ name: "Ada Lovelace", email: "ada@fixture.test" })
    .returning()

  const [site] = await db
    .insert(station)
    .values({ name: "Central Mall", address: "1 Mall Way" })
    .returning()

  const sizeRows = await db.insert(lockerSize).values(SIZES).returning()
  const sizeIds = Object.fromEntries(
    sizeRows.map((row) => [row.code, row.id])
  ) as Record<string, string>

  const lockerRows = await db
    .insert(locker)
    .values(
      SIZES.flatMap((size) =>
        // `S1`, `S2`, … so a contention test can name the lockers it expects to win.
        Array.from({ length: counts[size.code] ?? 0 }, (_, index) => ({
          stationId: site.id,
          sizeId: sizeIds[size.code],
          label: `${size.code}${index + 1}`,
        }))
      )
    )
    .returning()
  const lockerIds = Object.fromEntries(
    lockerRows.map((row) => [row.label, row.id])
  ) as Record<string, string>

  return {
    agentId,
    customerId: recipient.id,
    stationId: site.id,
    sizeIds,
    lockerIds,
  }
}

/** In foreign-key order, so a re-run starts from nothing. */
export const clearNetwork = async (pool: Pool): Promise<void> => {
  await pool.query("DELETE FROM package")
  await pool.query("DELETE FROM locker")
  await pool.query("DELETE FROM station")
  await pool.query("DELETE FROM locker_size")
  await pool.query("DELETE FROM customer")
  await pool.query(`DELETE FROM "user" WHERE email LIKE '%@fixture.test'`)
}
