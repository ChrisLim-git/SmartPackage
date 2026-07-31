// Must stay first: the imports below read the environment as they evaluate.
import "./load-env"

import { eq } from "drizzle-orm"

import { auth, type Role } from "../external/auth/auth"
import { db, pool } from "./client"
import { locker } from "./schema/locker"
import { lockerSize } from "./schema/locker-size"
import { feeTier, pricingConfig } from "./schema/pricing"
import { station } from "./schema/station"

/**
 * Re-runnable seed: existing rows are never overwritten. No write has an
 * acting user, so `created_by` stays null — the reason the column is nullable.
 */

const ACCOUNTS: ReadonlyArray<{ name: string; email: string; role: Role }> = [
  { name: "Avery Admin", email: "admin@smartpackage.test", role: "admin" },
  { name: "Ada Agent", email: "agent@smartpackage.test", role: "agent" },
]

const SEED_PASSWORD = "smartpackage"

const seedAccounts = async () => {
  for (const account of ACCOUNTS) {
    const existing = await pool.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [account.email]
    )

    if (existing.rows.length > 0) {
      console.log(`  ${account.email} — already there`)
      continue
    }

    // Via Better Auth's context, since sign-up is disabled: it hashes the
    // password the way sign-in verifies it and mints the id consistently.
    const context = await auth.$context
    const hashed = await context.password.hash(SEED_PASSWORD)

    const created = await context.internalAdapter.createUser({
      name: account.name,
      email: account.email,
      emailVerified: false,
      // Settable only here: `input: false` keeps `role` out of request payloads.
      role: account.role,
    })

    // The password lives on a linked `credential` account, not on the user.
    await context.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: hashed,
    })

    console.log(`  ${account.email} — created as ${account.role}`)
  }
}

const SIZES = [
  { code: "S", rank: 1, label: "Small" },
  { code: "M", rank: 2, label: "Medium" },
  { code: "L", rank: 3, label: "Large" },
]

// Central Mall's three L lockers are load-bearing: the contention test asserts
// exactly three of twenty concurrent stores win.
const STATIONS = [
  {
    name: "Central Mall",
    address: "180 Bourke Street, Melbourne",
    lockers: { S: 4, M: 3, L: 3 },
  },
  {
    name: "Riverside Offices",
    address: "8 Riverside Quay, Southbank",
    lockers: { S: 2, M: 2, L: 1 },
  },
]

/** Contiguous from day 1, with exactly one unbounded band — `PricingConfig` rejects anything else. */
const FEE_TIERS = [
  { fromDay: 1, toDay: 5, multiplierHundredths: 100 },
  { fromDay: 6, toDay: 10, multiplierHundredths: 200 },
  { fromDay: 11, toDay: null, multiplierHundredths: 300 },
]

const BASE_RATE_PER_DAY = "2.00"
const CURRENCY_CODE = "AUD"

const seedSizes = async (): Promise<Map<string, string>> => {
  await db.insert(lockerSize).values(SIZES).onConflictDoNothing({
    target: lockerSize.code,
  })

  const rows = await db
    .select({ id: lockerSize.id, code: lockerSize.code })
    .from(lockerSize)

  console.log(`  sizes: ${rows.map((row) => row.code).join(", ")}`)

  return new Map(rows.map((row) => [row.code, row.id]))
}

const seedStations = async (sizeIds: Map<string, string>) => {
  for (const details of STATIONS) {
    // Matched on name — there is no unique index on it.
    const [existing] = await db
      .select({ id: station.id })
      .from(station)
      .where(eq(station.name, details.name))
      .limit(1)

    const stationId =
      existing?.id ??
      (
        await db
          .insert(station)
          .values({ name: details.name, address: details.address })
          .returning({ id: station.id })
      )[0].id

    const lockers = Object.entries(details.lockers).flatMap(([code, count]) =>
      Array.from({ length: count }, (_, index) => ({
        stationId,
        sizeId: sizeIds.get(code)!,
        // `S1`, `S2`, … — unique within a station.
        label: `${code}${index + 1}`,
      }))
    )

    await db
      .insert(locker)
      .values(lockers)
      .onConflictDoNothing({ target: [locker.stationId, locker.label] })

    console.log(`  ${details.name}: ${lockers.length} lockers`)
  }
}

const seedPricing = async () => {
  const [existing] = await db
    .select({ id: pricingConfig.id })
    .from(pricingConfig)
    .limit(1)

  if (existing !== undefined) {
    console.log("  pricing — already there")
    return
  }

  await db.insert(pricingConfig).values({
    baseRatePerDay: BASE_RATE_PER_DAY,
    currencyCode: CURRENCY_CODE,
  })
  await db.insert(feeTier).values(FEE_TIERS)

  console.log(
    `  pricing: ${CURRENCY_CODE} ${BASE_RATE_PER_DAY}/day, ${FEE_TIERS.length} tiers`
  )
}

async function seed() {
  console.log("Accounts:")
  await seedAccounts()
  console.log("Master data:")
  const sizeIds = await seedSizes()
  await seedStations(sizeIds)
  await seedPricing()
}

seed()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
