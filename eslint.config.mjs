import { resolve } from "node:path"

import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import boundaries from "eslint-plugin-boundaries"

/**
 * Dependencies point inward, and this file is the enforcement. See the README's
 * architecture section for what the layers mean.
 */

/** Anything that would tie an inner layer to a framework or a driver. */
const FRAMEWORK_PACKAGES = [
  "next",
  "next/*",
  "react",
  "react-dom",
  "pg",
  "drizzle-orm",
  "drizzle-orm/*",
]

/**
 * The domain is stricter still: no auth library, no id library, and no Node
 * built-ins — `node:crypto` is the back door that makes a domain entity
 * generate its own ids and stop being testable.
 */
/**
 * `utils/` holds the test doubles: in-memory repositories, a stub code
 * generator, a pool onto `smartpackage_test`. Reached from production code, any
 * of them is a route serving fabricated data or the application writing to the
 * test database — and both would pass the suite and fail in front of a person.
 *
 * Restated in every block that sets `no-restricted-imports`, because flat config
 * *replaces* a rule rather than merging it: the domain's own package ban
 * silently dropped this guard until a deliberate probe found the hole.
 */
const TEST_DOUBLE_IMPORTS = {
  group: ["@/utils/*", "**/utils/in-memory-*", "**/utils/test-db"],
  message:
    "test doubles are for tests only — production code takes the real implementation from the container.",
}

const DOMAIN_FORBIDDEN_PACKAGES = [
  ...FRAMEWORK_PACKAGES,
  "better-auth",
  "better-auth/*",
  "uuidv7",
  "node:*",
  "crypto",
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    // components/, hooks/ and lib/ are listed as sources too, not just as import
    // targets — otherwise a shadcn component could import the database and
    // nothing would report it.
    files: [
      "src/**/*.{ts,tsx}",
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "hooks/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ],
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": resolve(import.meta.dirname),
      // Without this the @domain/* specifiers never resolve to a real file and
      // the boundary rules silently match nothing.
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
      },
      // Bare directory patterns, not "src/domain/**/*". v7 matches a path
      // prefix, so "src/domain" classifies everything beneath it, while
      // "src/domain/**/*" leaves files sitting directly in the folder
      // unclassified — and every policy below then skips them silently.
      "boundaries/elements": [
        { type: "domain", pattern: "src/domain" },
        // Wire shapes, a peer of the layers rather than inside one. They read
        // the domain to map from it, and nothing in the domain reads them
        // back — a DTO exists for the outside world, so the domain owning one
        // would be the domain knowing how it is serialised.
        { type: "dtos", pattern: "src/dtos" },
        { type: "infrastructure", pattern: "src/infrastructure" },
        // app/ is the composition root: it wires concrete implementations into
        // domain services, so it is the one place allowed to see everything.
        { type: "app", pattern: "app" },
        // `components/ui` must come before `components`. The plugin classifies
        // a file by its *nearest* matching ancestor folder, so a shadcn
        // primitive resolves to `ui` while a component beside it resolves to
        // `presentation` — which is the whole point of the split: a design
        // system leaf must not reach the application, and an app component
        // must. Verified by probe in both directions, because a
        // misclassification here is silent.
        { type: "ui", pattern: "components/ui" },
        { type: "ui", pattern: "lib" },
        // Next is the frontend, so the presentation layer *is* Next's own
        // folders rather than a parallel tree inside src/.
        { type: "presentation", pattern: "components" },
        { type: "presentation", pattern: "hooks" },
        // Test doubles and fixtures: in-memory repositories, stub generators, a
        // pool onto the test database. They implement domain contracts and read
        // the schema, so they may see the inner layers — and nothing outside a
        // test may see them, which the `no-restricted-imports` rule below
        // enforces separately, because a dependency *direction* rule cannot
        // express "only from a test file".
        // `mode: "file"` with an explicit `utils/*.ts`, because a bare `utils`
        // pattern also matches `src/domain/utils` — the plugin classifies by the
        // nearest ancestor whose *name* matches, so the value objects would have
        // been reclassified out of the domain and every rule about them would
        // have started reporting on the wrong thing.
        { type: "utils", pattern: "utils", partialMatch: false },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "{{from.element.types}} must not depend on {{to.element.types}}",
          policies: [
            // Every layer may reach `utils`, and only a test actually does: a
            // dependency-direction rule cannot say "from a test file", so the
            // `no-restricted-imports` block below is what keeps production out.
            // Expressed here rather than by exempting test files from boundaries
            // altogether, which would also stop reporting a test that imports
            // across two layers it has no business joining.
            {
              from: { element: { type: "domain" } },
              allow: { to: { element: { type: ["domain", "utils"] } } },
            },
            {
              from: { element: { type: "dtos" } },
              allow: {
                to: { element: { type: ["dtos", "domain", "utils"] } },
              },
            },
            {
              from: { element: { type: "infrastructure" } },
              allow: {
                to: {
                  element: {
                    type: ["infrastructure", "domain", "dtos", "utils"],
                  },
                },
              },
            },
            {
              from: { element: { type: "presentation" } },
              allow: {
                to: {
                  element: {
                    type: ["presentation", "domain", "dtos", "ui", "utils"],
                  },
                },
              },
            },
            {
              from: { element: { type: "ui" } },
              allow: { to: { element: { type: "ui" } } },
            },
            {
              from: { element: { type: "utils" } },
              allow: {
                to: {
                  element: {
                    type: ["utils", "domain", "dtos", "infrastructure"],
                  },
                },
              },
            },
            {
              from: { element: { type: "app" } },
              allow: {
                to: {
                  element: {
                    type: [
                      "app",
                      "presentation",
                      "infrastructure",
                      "domain",
                      "dtos",
                      "ui",
                      "utils",
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },

  {
    // A leading underscore marks a parameter that exists to satisfy an
    // interface rather than to be used — an implementation that ignores an
    // argument on purpose. Without this, the only way to keep the signature is
    // a disable comment on every such method.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    // A fake is for a test, and only for a test.
    //
    // `utils/` holds in-memory repositories, a stub code generator and a pool
    // onto `smartpackage_test`. Any of them reached from production code would
    // be a route serving fabricated data, or the application writing to the test
    // database — both of which would pass a suite and fail in front of a person.
    files: [
      "src/**/*.ts",
      "src/**/*.tsx",
      "app/**/*.ts",
      "app/**/*.tsx",
      "components/**/*.tsx",
      "hooks/**/*.ts",
    ],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [TEST_DOUBLE_IMPORTS] }],
    },
  },

  {
    files: ["src/domain/**/*.ts"],
    ignores: ["src/domain/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: DOMAIN_FORBIDDEN_PACKAGES,
              message:
                "The domain imports nothing but itself. Declare an interface; implement it in infrastructure.",
            },
            TEST_DOUBLE_IMPORTS,
          ],
        },
      ],
      // Boundary rules cover imports; these cover ambient globals. Time, ids and
      // codes must arrive through the Clock / IdGenerator / PickupCodeGenerator
      // interfaces, which is what makes every domain test instant and repeatable.
      "no-restricted-syntax": [
        "error",
        {
          // Production domain code constructs no Date at all — every instant it
          // works with was handed to it. The narrower zero-argument form is
          // allowed only in domain *tests*, which have to pin an instant; see
          // the override below.
          selector: "NewExpression[callee.name='Date']",
          message:
            "domain must take time from the Clock interface, not `new Date()`.",
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message:
            "domain must take time from the Clock interface, not `Date.now()`.",
        },
        {
          selector:
            "MemberExpression[object.name='Math'][property.name='random']",
          message:
            "domain must take randomness from an interface (IdGenerator / PickupCodeGenerator), not `Math.random()`.",
        },
        {
          selector: "MemberExpression[object.name='crypto']",
          message:
            "domain must take ids from the IdGenerator interface, not the crypto global.",
        },
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message: "domain must not read configuration; pass it in.",
        },
      ],
    },
  },

  {
    // A domain test has to be able to pin an instant, so it may build a Date
    // *from a value* — `new Date("2026-01-01T00:00:00.000Z")`. The
    // zero-argument call still reaches for the machine clock and is still
    // rejected here, as are Date.now, Math.random, crypto and process.env,
    // which this override does not touch.
    files: ["src/domain/**/*.test.ts"],
    rules: {
      // The package ban still applies — a domain test importing React would mean
      // the same thing it means anywhere else in the layer — but the doubles are
      // exactly what a domain test is supposed to reach for.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: DOMAIN_FORBIDDEN_PACKAGES,
              message:
                "The domain imports nothing but itself. Declare an interface; implement it in infrastructure.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "domain must take time from the Clock interface, not `new Date()`.",
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message:
            "domain must take time from the Clock interface, not `Date.now()`.",
        },
        {
          selector:
            "MemberExpression[object.name='Math'][property.name='random']",
          message:
            "domain must take randomness from an interface (IdGenerator / PickupCodeGenerator), not `Math.random()`.",
        },
        {
          selector: "MemberExpression[object.name='crypto']",
          message:
            "domain must take ids from the IdGenerator interface, not the crypto global.",
        },
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message: "domain must not read configuration; pass it in.",
        },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "drizzle/**",
    // A git worktree lives here, which is a second full checkout of this repo.
    // Without this every tool lints, typechecks, formats and *runs the tests of*
    // both copies — the suite silently doubles and reports another commit's
    // failures as this one's.
    ".claude/**",
  ]),
])

export default eslintConfig
