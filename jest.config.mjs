/**
 * Jest is configured directly against `@swc/jest` rather than through `next/jest`.
 *
 * Reason: `better-auth` is ESM-only, so the whole suite runs as ESM
 * (`"type": "module"` + `--experimental-vm-modules` + `extensionsToTreatAsEsm`).
 * `next/jest` injects its own CJS-oriented SWC transform and merges its
 * `moduleNameMapper` last, which fights that setup. The only things it gives us
 * that we actually need are the asset/style mocks, replicated below in four lines.
 *
 * Default environment is `node` — the domain and application layers have no DOM.
 * Component tests opt in per-file with a docblock:
 *
 *   \/** @jest-environment jsdom *\/
 *
 * @type {import('jest').Config}
 */
const config = {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  globalSetup: "<rootDir>/jest.global-setup.mjs",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],

  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          target: "es2022",
          transform: { react: { runtime: "automatic" } },
        },
        module: { type: "es6" },
      },
    ],
  },

  // Layer aliases first, `@/*` catch-all last — Jest matches in insertion order.
  moduleNameMapper: {
    "^@domain/(.*)$": "<rootDir>/src/domain/$1",
    "^@application/(.*)$": "<rootDir>/src/application/$1",
    "^@infrastructure/(.*)$": "<rootDir>/src/infrastructure/$1",
    "^@presentation/(.*)$": "<rootDir>/src/presentation/$1",
    "\\.(css|less|sass|scss)$": "<rootDir>/test/mocks/style.cjs",
    "\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg|woff2?)$":
      "<rootDir>/test/mocks/file.cjs",
    "^server-only$": "<rootDir>/test/mocks/empty.cjs",
    "^@/(.*)$": "<rootDir>/$1",
  },

  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/.next/",
    "/test/",
    "/components/ui/",
  ],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
};

export default config;
