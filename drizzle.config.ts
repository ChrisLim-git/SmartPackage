import { loadEnvConfig } from "@next/env"
import { defineConfig } from "drizzle-kit"

// drizzle-kit does not read .env.local on its own. Using @next/env rather than
// dotenv keeps the loading order identical to the one `next dev` uses.
//
// Note this is a *named* import while jest.global-setup.mjs default-imports the
// same package. drizzle-kit bundles this file to CJS with esbuild, where named
// imports of a CJS module work and `.default` is undefined; Jest loads its setup
// as real ESM, where the opposite holds.
loadEnvConfig(process.cwd())

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/database/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // Must agree with the `casing` passed to drizzle() in client.ts.
  casing: "snake_case",
  strict: true,
  verbose: true,
})
