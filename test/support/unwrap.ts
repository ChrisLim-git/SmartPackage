import { isErr, type Result } from "@domain/shared/result"

/**
 * Unwraps a `Result` a test knows is `Ok`, for fixtures rather than assertions.
 *
 * A throw here means the test itself is wrong — it fed a value object something
 * invalid — which is worth telling apart from the behaviour under test failing.
 */
export const unwrap = <T>(result: Result<T, { message: string }>): T => {
  if (isErr(result)) {
    throw new Error(`test setup failed: ${result.error.message}`)
  }
  return result.value
}
