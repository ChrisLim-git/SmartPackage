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
- **Mocking a module in ESM is `jest.unstable_mockModule` plus a dynamic `import`.** A static import binds the real module before the mock is registered, because an ESM graph resolves on import. Register the mock, then `const { GET } = await import("./route")` — top-level await is available. `jest` itself comes from `@jest/globals`.
- **Every TanStack Query call lives in `hooks/`, one hook per file**, named for the hook it exports. A component renders; it does not fetch. `hooks/api.ts` is the exception and is not a hook — it holds the axios instance (`baseURL: "/api"`, so a hook names `/stations`), `get`, `post`, and the cache keys, so an invalidation and the query it refreshes cannot drift apart. A response interceptor unwraps `{ error: { code, message } }` into a plain `Error`, so nothing above that file knows which client is underneath.
- **A `fetch` stub does not intercept axios under jsdom** — axios reaches for `XMLHttpRequest` there, so the stub sees nothing and the component renders an empty table. Mock `@/hooks/api` instead, which is also the right seam: a test about a rendered count has no business knowing the transport.
- **`utils/` at the root holds both the real small adapters and the doubles** — the clock, the generators and the hasher that `container.ts` wires, beside the fakes that replace them in a test. **Every double is named `fake-*`, `stub-*`, `in-memory-*`, `test-*` or `*-fixture`**, because that naming _is_ the guard: `no-restricted-imports` bans those patterns from production and lets the real ones through. Name a double anything else and it becomes importable from a route. The guard is **restated in every block that sets the rule** — flat config replaces a rule rather than merging it, so the domain's own package ban silently dropped it until a probe found the hole. The element pattern also needs `partialMatch: false`, or a bare `utils` matches `src/domain/utils` too and reclassifies every value object out of the domain.
- **`pnpm test:unit` must claim `/utils/`**, or the tests that live beside those adapters run under `pnpm test` while both named buckets skip them. The two buckets have to partition the suite exactly; check the arithmetic after any move.
- **DTOs have no tests.** They are structure, and a mapping test asserts that a field is copied. What is worth asserting about them — that money crosses as a fixed string, that a 404 never echoes the identifier it was asked about, that a thrown error leaks nothing — is asserted over HTTP in the route tests, where it is observable.
- **`eslint-plugin-boundaries` classifies a file by its nearest matching ancestor folder name**, not by the order elements are declared and not by `./` prefixes. That is load-bearing here: `components/ui` is listed as `ui` and `components` as `presentation`, so a shadcn primitive and an app component sitting one directory apart get different rules. It also bites — a folder that happens to share a name with an element pattern inherits that element's rules, silently, and lint reports nothing. After moving any folder, probe both sides rather than assuming.
- **`@next/env` is CommonJS.** `drizzle.config.ts` is bundled to CJS by drizzle-kit and uses a _named_ import; `jest.env-setup.mjs` is real ESM and uses a _default_ import. Both are correct. Don't "fix" either.
- **`boundaries/elements` patterns are bare directories** (`"src/domain"`). `"src/domain/**/*"` leaves files sitting directly in the folder unclassified, and every dependency rule then skips them **without reporting anything**. `boundaries/external` and `mode:` are both deprecated in v7 — external packages are restricted with `no-restricted-imports` instead.
- **There is no application layer and no use-case layer.** The `Repository<T>` and `UnitOfWork` contracts live in `src/domain/interfaces/`, so a flow that needs persistence is a **domain service** in `src/domain/services/` and still imports nothing outside the domain. Route handlers guard, validate, delegate and map — they hold no behaviour, and their tests assert only the HTTP contract.
- **`@types/*` cannot be a path alias.** TypeScript reserves the prefix for DefinitelyTyped packages and rejects the import with `TS6137` no matter what `paths` says. The DTO alias is `@dtos/*`. Aliases in full: `@domain/*`, `@dtos/*`, `@infrastructure/*`, `@/*`.
- **`pnpm db:migrate` migrates the development database only.** The test database is a separate database on the same server, and the integration suite fails against a stale one in a way that names a query rather than the cause: `DATABASE_URL=$TEST_DATABASE_URL pnpm db:migrate` after every new migration.
- **A partial index predicate must be raw `sql`.** `uniqueIndex().where(eq(table.status, "stored"))` compiles, and drizzle-kit then emits `WHERE status = $1` into the migration — DDL takes no parameters, so Postgres rejects it. Write `sql\`status = 'stored' AND deleted_at IS NULL\``instead. The matching key on`onConflictDoNothing`is`where`; on `onConflictDoUpdate`it is`targetWhere`. Both mean the index predicate.
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
