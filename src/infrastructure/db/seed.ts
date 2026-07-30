// Must stay first: it loads the environment, and every import below reads it
// while being evaluated. Moving it down leaves the pool without a password.
import "./load-env"

import { eq } from "drizzle-orm"

import { auth, type Role } from "../auth/auth"
import { db, pool } from "./client"
import { locker } from "./schema/locker"
import { lockerSize } from "./schema/locker-size"
import { feeTier, pricingConfig } from "./schema/pricing"
import { station } from "./schema/station"

/**
 * Master data lives here rather than in a migration: it is reference data an
 * operator may want to re-run or edit, not a schema change.
 *
 * Every write here is re-runnable. Nothing is updated on a second pass either —
 * a seed that overwrites is a seed that quietly discards whatever an operator
 * changed by hand.
 *
 * No write has an acting user, so `created_by` stays null throughout. That is
 * the reason the column is nullable.
 */

/**
 * One account per role, so a reviewer can sign in as each without creating
 * anything. The password is the same for all three and is published in the
 * README — these accounts exist on a local demo database, and making them hard
 * to find would only cost a reviewer time without protecting anything.
 */
const ACCOUNTS: ReadonlyArray<{ name: string; email: string; role: Role }> = [
  { name: "Avery Admin", email: "admin@smartpackage.test", role: "admin" },
  { name: "Ada Agent", email: "agent@smartpackage.test", role: "agent" },
  {
    name: "Cam Customer",
    email: "customer@smartpackage.test",
    role: "customer",
  },
]

const SEED_PASSWORD = "smartpackage"

/** Re-runnable: an account that already exists is left exactly as it is. */
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

    // Through the auth API rather than an INSERT: the password has to be
    // hashed the way sign-in will verify it, and only Better Auth knows how.
    await auth.api.signUpEmail({
      body: {
        name: account.name,
        email: account.email,
        password: SEED_PASSWORD,
      },
      asResponse: true,
    })

    // The role is a privileged field that a sign-up cannot set, so it is
    // granted here — the same promotion path an admin screen would use.
    await pool.query(`UPDATE "user" SET role = $1 WHERE email = $2`, [
      account.role,
      account.email,
    ])

    console.log(`  ${account.email} — created as ${account.role}`)
  }
}

const SIZES = [
  { code: "S", rank: 1, label: "Small" },
  { code: "M", rank: 2, label: "Medium" },
  { code: "L", rank: 3, label: "Large" },
]

/**
 * Central Mall has **exactly three L lockers**, and that number is load-bearing
 * rather than decorative: the contention proof fires twenty concurrent requests
 * for an L package and asserts that exactly three win. Change the count here
 * and that test's expectation changes with it.
 */
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

/** Returns every size by code, so lockers can point at one without a second round trip each. */
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
    // Matched on name because there is no unique index on it: a station's name
    // is a label an operator may well want to change, and a constraint here
    // would make renaming one a migration.
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
        // `S1`, `S2`, … — unique within a station, which is the only place an
        // agent ever reads one.
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
