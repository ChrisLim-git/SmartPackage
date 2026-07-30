import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * One pool for the process. Next.js re-evaluates modules on hot reload, so
 * without the globalThis guard dev leaks a pool per reload until Postgres
 * refuses new connections.
 *
 * The driver is node-postgres deliberately. `postgres.js` turns on prepared
 * statements by default, which is a footgun behind a pooler, and
 * `@vercel/postgres` is HTTP, so it cannot hold a row lock across statements —
 * which the atomic locker claim needs.
 */
const globalForDb = globalThis as unknown as { __pool?: Pool };

export const pool =
  globalForDb.__pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pool = pool;
}

// `casing` must match drizzle.config.ts, or runtime queries name columns the
// migrations never created.
export const db = drizzle({ client: pool, schema, casing: "snake_case" });

export type Db = typeof db;

/** For repositories that must be able to join a caller's transaction. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
