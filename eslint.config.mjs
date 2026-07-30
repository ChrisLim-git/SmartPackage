import { resolve } from "node:path";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Dependencies point inward. This file is the enforcement — not a convention
 * document. `eslint-plugin-boundaries` v7 collapsed `element-types` and
 * `no-private` into a single `boundaries/dependencies` rule taking
 * `default` + `policies`; any pre-v7 config found online is wrong.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    files: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": resolve(import.meta.dirname),
      // Without this the @domain/* specifiers never resolve to a real file and
      // the boundary rules silently match nothing.
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
      },
      // Bare directory patterns, not `src/domain/**/*`. v7 matches a path
      // *prefix* by default, so "src/domain" classifies everything beneath it.
      // `src/domain/**/*` looks more precise and is worse: it leaves files
      // sitting directly in src/domain/ unclassified, which makes every policy
      // below skip them **silently**. Verified by deliberately violating the
      // rule — see the README's architecture section.
      "boundaries/elements": [
        { type: "domain", pattern: "src/domain" },
        { type: "application", pattern: "src/application" },
        { type: "infrastructure", pattern: "src/infrastructure" },
        { type: "presentation", pattern: "src/presentation" },
        // app/ is the composition root: it wires concrete implementations
        // into use cases, so it is the one place allowed to see everything.
        { type: "app", pattern: "app" },
        // shadcn primitives. Design-system leaves, not a layer.
        { type: "ui", pattern: "components" },
        { type: "ui", pattern: "hooks" },
        { type: "ui", pattern: "lib" },
      ],
      // A domain test may legitimately reach for an in-memory fake.
      "boundaries/ignore": ["**/*.test.ts", "**/*.test.tsx"],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message: "{{from.element.types}} must not depend on {{to.element.types}}",
          policies: [
            {
              from: { element: { type: "domain" } },
              allow: { to: { element: { type: "domain" } } },
            },
            {
              from: { element: { type: "application" } },
              allow: { to: { element: { type: ["application", "domain"] } } },
            },
            {
              from: { element: { type: "infrastructure" } },
              allow: {
                to: {
                  element: {
                    type: ["infrastructure", "application", "domain"],
                  },
                },
              },
            },
            {
              from: { element: { type: "presentation" } },
              allow: {
                to: {
                  element: {
                    type: ["presentation", "application", "domain", "ui"],
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
                      "application",
                      "infrastructure",
                      "domain",
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
    // Keeps the application layer framework-free. `boundaries/dependencies`
    // governs layer-to-layer imports; this governs third-party ones.
    // Deliberately the built-in rule rather than `boundaries/external`, which
    // v7 deprecates. The domain gets a stricter list further down.
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react-dom",
                "pg",
                "drizzle-orm",
                "drizzle-orm/*",
              ],
              message:
                "The domain and application layers are framework-free. Depend on a port and implement it in infrastructure.",
            },
          ],
        },
      ],
    },
  },

  {
    // The other half of the domain rule: no ambient non-determinism. Boundary
    // rules cover imports; these cover globals. Time, ids and codes must arrive
    // through the Clock / IdGenerator / PickupCodeGenerator ports so every
    // domain test is instant and repeatable.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react-dom",
                "pg",
                "drizzle-orm",
                "drizzle-orm/*",
                "better-auth",
                "better-auth/*",
                "uuidv7",
              ],
              message:
                "The domain imports nothing but itself. Declare a port; implement it in infrastructure.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message: "domain must take time from the Clock port, not `new Date()`.",
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "domain must take time from the Clock port, not `Date.now()`.",
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message:
            "domain must take randomness from a port (IdGenerator / PickupCodeGenerator), not `Math.random()`.",
        },
        {
          selector: "MemberExpression[object.name='crypto']",
          message:
            "domain must take ids from the IdGenerator port, not the crypto global.",
        },
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
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
]);

export default eslintConfig;
