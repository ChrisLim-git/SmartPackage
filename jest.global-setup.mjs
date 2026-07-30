// `@next/env` is CommonJS, so it has no named ESM exports — default-import it.
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// Loads .env / .env.local exactly the way `next dev` does, so integration tests
// see the same DATABASE_URL the app does.
export default async function globalSetup() {
  loadEnvConfig(process.cwd());
}
