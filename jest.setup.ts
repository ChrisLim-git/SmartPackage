// jest-dom's matchers assert against DOM nodes, so they are only loaded for the
// jsdom tests that opt in via a `@jest-environment jsdom` docblock. Importing it
// unconditionally would pull a DOM-shaped library into every domain test.
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom");
}
