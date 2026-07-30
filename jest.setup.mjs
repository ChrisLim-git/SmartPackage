// jest-dom's matchers assert against DOM nodes, so they are only loaded for the
// jsdom tests that opt in via a `@jest-environment jsdom` docblock. Importing it
// unconditionally would pull a DOM-shaped library into every domain test.
//
// This file is .mjs rather than .ts on purpose: it is runtime wiring, and
// jest-dom's type entry is a global augmentation rather than a module, so `tsc`
// rejects `await import()` of it. The matcher *types* still reach the tests via
// the "types" array in tsconfig.json.
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom");
}
