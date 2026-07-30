// `@next/env` is CommonJS — default-import it. (drizzle.config.ts uses the
// named form because drizzle-kit bundles it to CJS. Both are correct.)
import nextEnv from "@next/env"

/**
 * Loads `.env.local` the way `next dev` does, for scripts run outside Next —
 * `pnpm db:seed` gets no environment otherwise, and fails
 * inside pg with "client password must be a string".
 *
 * This is a module whose *body* does the loading, and it must be imported
 * first: ES module imports are all evaluated before the importing file's own
 * body runs, so calling `loadEnvConfig()` inside `seed.ts` would happen after
 * `client.ts` had already read `process.env.DATABASE_URL` and built its pool.
 */
nextEnv.loadEnvConfig(process.cwd())
