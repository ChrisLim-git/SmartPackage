import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "@infrastructure/database/schema"

/**
 * A connection to `smartpackage_test`, separate from the application pool so a
 * test can never write to the development database.
 *
 * The caller closes it in `afterAll`. Jest is never run with `--forceExit`: an
 * open pool that stops the process exiting is a leak worth seeing, and hiding
 * it means later hiding a real one.
 */
export const createTestDb = ({ max = 4 }: { max?: number } = {}) => {
  // `max` is the ceiling on how many transactions can genuinely overlap: a
  // contention test firing twenty requests through a pool of four is a test of
  // four-way contention and a queue. It asks for twenty.
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max,
  })

  // The schema is passed so this db is the same *type* as the application's,
  // and anything built against `typeof db` can be pointed at it in a test.
  return { pool, db: drizzle({ client: pool, schema, casing: "snake_case" }) }
}
