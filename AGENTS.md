<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Working in this repo

**Read [README.md](./README.md) first.** It is the single source for the commands, the layer rules, the interfaces, the locker invariant, the `Result` convention, the data rules, the test strategy and the commit format. Do not restate any of it here — this file only adds what a reviewer doesn't need but you do.

Read [DESIGN.md](./DESIGN.md) before touching UI.

## Things that will waste your time if you guess

- **Tests run as ESM.** `"type": "module"` + `NODE_OPTIONS=--experimental-vm-modules` + `@swc/jest`. Not `next/jest`, not `ts-jest` — `better-auth` ships no CJS build. Default environment is `node`; a component test opts into the DOM with a `/** @jest-environment jsdom */` docblock on line 1.
- **The `jest` global does not exist in the tests.** `describe`, `it` and `expect` are injected, but ESM leaves `jest` itself out — `jest.fn()` fails with `ReferenceError: jest is not defined`. Import it from `@jest/globals`, or in the domain just count calls in a closure; a pure layer needs no mocking framework.
- **`@next/env` is CommonJS.** `drizzle.config.ts` is bundled to CJS by drizzle-kit and uses a _named_ import; `jest.global-setup.mjs` is real ESM and uses a _default_ import. Both are correct. Don't "fix" either.
- **`boundaries/elements` patterns are bare directories** (`"src/domain"`). `"src/domain/**/*"` leaves files sitting directly in the folder unclassified, and every policy then skips them **without reporting anything**. `boundaries/external` and `mode:` are both deprecated in v7 — external packages are restricted with `no-restricted-imports` instead.
- **Postgres 18's image mounts at `/var/lib/postgresql`**, not `/var/lib/postgresql/data`. `docker/init-test-db.sql` only runs on first initialisation of the volume; after a schema-breaking change, `docker compose down -v`.
- **Regenerating `auth-schema.ts` needs `generateId: "uuid"` set in `auth.ts` for the duration of the run.** That option is what the CLI reads to emit `uuid` id columns; with the v7 function in place it emits `text` again, and the whole schema silently reverts to BetterAuth's 32-character base62 ids. The function is what makes the value a v7 — `"uuid"` alone defers to `gen_random_uuid()` on Postgres, which is v4.
- **`drizzle-kit` emits a bare `SET DATA TYPE uuid`, which Postgres refuses** on a `text` column: `column "id" cannot be cast automatically to type uuid`. The `USING "id"::uuid` clause is the missing half and Drizzle cannot express it, so `0004` is hand-completed. Foreign keys spanning the column have to be dropped first — a key cannot span a `uuid` and a `text` column while one side is still the old type.
- **`package` is a reserved word in strict mode**, and every module is strict, so `export const package = pgTable(...)` does not parse. The table is `package`; the export is `packageTable`.
- **A constraint violation through Drizzle names the constraint on `error.cause`, not on the message.** The message is the failed query. Assert with `rejects.toMatchObject({ cause: { constraint: "..." } })`; a `rejects.toThrow(/constraint_name/)` passes only by accident through raw `pool.query`.
- **A partial unique index needs its predicate repeated in `ON CONFLICT`.** `uniqueIndex().where(...)` builds a partial index, and Postgres will not infer one from the column alone — `onConflictDoUpdate({ target })` fails with "there is no unique or exclusion constraint matching the ON CONFLICT specification" until you add `targetWhere` with the same predicate.
- **`SequentialIdGenerator` cannot be used against a `uuid` column.** It emits `customer-0001`, which is a fine readable id in a domain test and invalid input syntax in Postgres. Repository tests use the real `UuidV7Generator`.
- **Never test concurrency against PGlite** — it serialises transactions, so `SKIP LOCKED` never skips and broken code goes green.
- **`shadcn add form` writes nothing** in 4.x — it is a file-less registry stub. Forms are `field` + react-hook-form's own `<Controller />`. Any `<Form>/<FormField>` snippet is pre-4.x.
- **`sonner`, not `toast`** — the base is pinned to `radix`, where `sonner` is the documented toast (`toast("…")`).
- **`typescript` is pinned to `~5.9.3`** — `latest` is the 7.x Go port and breaks the toolchain. `eslint` is pinned to `^9`.
- **`middleware.ts` is `proxy.ts`** in Next 16, and it silently no-ops if misnamed.
- **`params` and `searchParams` are Promises** — `await` them.
- **Debug port is 9230**, not 9229 — `next dev --inspect` forks a child for app code.

## Commit messages

The `commit-msg` hook has no exceptions, so a commit subject must not name the `CLAUDE.md` file — write "agent guidance" instead. The hook and the audit in the README use one identical pattern on purpose: if the hook let something through that the audit catches, the repo would fail its own gate at submission.

## Planning context

The functional spec, ADRs, per-phase plans and per-ticket acceptance criteria live in an Obsidian vault in the **parent directory**, deliberately not committed. Work runs as phases P0–P6 with a review gate between each. If a decision looks arbitrary, it is probably recorded as an ADR there rather than being arbitrary.
