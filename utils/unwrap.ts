import { isErr, type Result } from "@domain/shared/result"

/**
 * Unwraps a `Result` a test knows is `Ok`, for fixtures rather than assertions;
 * a throw here means the test setup itself is wrong.
 */
export const unwrap = <T>(result: Result<T, { message: string }>): T => {
  if (isErr(result)) {
    throw new Error(`test setup failed: ${result.error.message}`)
  }
  return result.value
}
