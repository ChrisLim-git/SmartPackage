// `@next/env` is CommonJS — default-import it. (drizzle.config.ts uses the
// named form because drizzle-kit bundles it to CJS. Both are correct.)
import nextEnv from "@next/env"

/**
 * Loads `.env.local` for scripts run outside Next. Must be imported first: ESM
 * imports evaluate before the importer's body, so a later load would run after
 * `client.ts` has already read `DATABASE_URL` and built its pool.
 */
nextEnv.loadEnvConfig(process.cwd())
