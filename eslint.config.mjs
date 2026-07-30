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
            {
              from: { element: { type: "domain" } },
              allow: { to: { element: { type: "domain" } } },
            },
            {
              from: { element: { type: "dtos" } },
              allow: { to: { element: { type: ["dtos", "domain"] } } },
            },
            {
              from: { element: { type: "infrastructure" } },
              allow: {
                to: {
                  element: {
                    type: ["infrastructure", "domain", "dtos"],
                  },
                },
              },
            },
            {
              from: { element: { type: "presentation" } },
              allow: {
                to: {
                  element: {
                    type: ["presentation", "domain", "dtos", "ui"],
                  },
                },
              },
            },
            {
              from: { element: { type: "ui" } },
              allow: { to: { element: { type: "ui" } } },
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
    files: ["src/domain/**/*.ts"],
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
  ]),
])

export default eslintConfig
