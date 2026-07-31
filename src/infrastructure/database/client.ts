import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

/**
 * One pool for the process; the globalThis guard stops hot reload leaking a
 * pool per reload. node-postgres specifically: the atomic locker claim needs a
 * driver that can hold a row lock across statements.
 */
const globalForDb = globalThis as unknown as { __pool?: Pool }

export const pool =
  globalForDb.__pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

// Development only: under test the cached pool would outlive Jest's per-suite
// module registry, leaving later suites holding a closed pool.
if (process.env.NODE_ENV === "development") {
  globalForDb.__pool = pool
}

// `casing` must match drizzle.config.ts, or runtime queries name columns the
// migrations never created.
export const db = drizzle({ client: pool, schema, casing: "snake_case" })

export type Db = typeof db

/** For repositories that must be able to join a caller's transaction. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]
