import { readFileSync } from "node:fs"
import { join } from "node:path"

// `@next/env` is CommonJS, so it has no named ESM exports — default-import it.
// (drizzle.config.ts uses the *named* form, because drizzle-kit bundles it to
// CJS. Both are correct; neither is a mistake to "fix".)
import nextEnv from "@next/env"

const { loadEnvConfig } = nextEnv

// This runs as `setupFiles`, not `globalSetup`, and the distinction is the whole
// point: `globalSetup` executes once in the main process, and Jest runs tests in
// separate worker processes that never inherit what it wrote to `process.env`.
// `setupFiles` runs once per worker, before the test file is imported, so a
// module-scope database connection sees the environment.
loadEnvConfig(process.cwd())

// ...and that is still not enough. Next deliberately ignores `.env.local` when
// NODE_ENV is `test` — its stated reason is that tests should produce the same
// result on every machine. Jest sets NODE_ENV=test, so the credentials in
// `.env.local` are invisible to the loader above, and an integration test fails
// inside pg with "client password must be a string" rather than anything that
// names the cause.
//
// So `.env.local` is read here explicitly. Anything already in the environment
// wins, which keeps CI (where the variables are set directly) authoritative.
const parseEnvFile = (contents) =>
  contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .flatMap((line) => {
      const separator = line.indexOf("=")
      if (separator === -1) return []

      const key = line.slice(0, separator).trim()
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^(['"])(.*)\1$/, "$2")

      return [[key, value]]
    })

try {
  const contents = readFileSync(join(process.cwd(), ".env.local"), "utf8")

  for (const [key, value] of parseEnvFile(contents)) {
    process.env[key] ??= value
  }
} catch (error) {
  // No `.env.local` is normal in CI. Anything else is worth seeing.
  if (error.code !== "ENOENT") throw error
}

// Under test, `DATABASE_URL` *is* the test database.
//
// `test-db.ts` names TEST_DATABASE_URL explicitly, but the application's own
// pool reads DATABASE_URL — so anything imported through the composition root
// (a route handler, for instance) would otherwise write to the development
// database from inside a test run. Pointing the variable itself makes that
// impossible rather than merely discouraged.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
}
