import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

/**
 * A connection to `smartpackage_test`, separate from the application pool so a
 * test can never write to the development database.
 *
 * The caller closes it in `afterAll`. Jest is never run with `--forceExit`: an
 * open pool that stops the process exiting is a leak worth seeing, and hiding
 * it means later hiding a real one.
 */
export const createTestDb = () => {
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max: 4,
  })

  return { pool, db: drizzle({ client: pool, casing: "snake_case" }) }
}
