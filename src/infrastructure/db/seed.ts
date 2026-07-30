import { pool } from "./client"

/**
 * Master data lives here rather than in a migration: it is reference data an
 * operator may want to re-run or edit, not a schema change.
 *
 * Stations, locker sizes, lockers and the pricing configuration land in T302.
 */
async function seed() {
  console.log("Nothing to seed yet — master data arrives with the schema.")
}

seed()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
