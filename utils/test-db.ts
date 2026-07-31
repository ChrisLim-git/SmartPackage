import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "@infrastructure/database/schema"

/**
 * A connection to `smartpackage_test`, separate from the application pool. The
 * caller closes it in `afterAll`; Jest is never run with `--forceExit`.
 */
export const createTestDb = ({ max = 4 }: { max?: number } = {}) => {
  // `max` caps how many transactions genuinely overlap; a contention test must
  // ask for as many connections as requests it fires.
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max,
  })

  // Schema passed so this db is the same *type* as the application's.
  return { pool, db: drizzle({ client: pool, schema, casing: "snake_case" }) }
}
