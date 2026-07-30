/**
 * `Result` is how every layer reports an expected failure. Throwing is
 * reserved for bugs and infrastructure faults: "no locker fits this package"
 * and "that pickup code is wrong" are ordinary outcomes, and a service that
 * returns them is a service whose failure paths can be asserted without
 * `expect().toThrow()`.
 *
 * Deliberately four operations and no more. This is a return shape, not a
 * monad library — `andThen`, `match` and friends can be added the day a real
 * call site wants one.
 */

export type Ok<T> = { readonly kind: "ok"; readonly value: T }
export type Err<E> = { readonly kind: "err"; readonly error: E }

export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ kind: "ok", value })

export const err = <E>(error: E): Err<E> => ({ kind: "err", error })

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> =>
  result.kind === "ok"

export const isErr = <T, E>(result: Result<T, E>): result is Err<E> =>
  result.kind === "err"

/** Transforms the value of an `Ok`. An `Err` passes through untouched. */
export const map = <T, E, U>(
  result: Result<T, E>,
  transform: (value: T) => U
): Result<U, E> => (isOk(result) ? ok(transform(result.value)) : result)

/** Transforms the error of an `Err`. An `Ok` passes through untouched. */
export const mapErr = <T, E, F>(
  result: Result<T, E>,
  transform: (error: E) => F
): Result<T, F> => (isErr(result) ? err(transform(result.error)) : result)

/** The value if there is one, the fallback if there is not. */
export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T =>
  isOk(result) ? result.value : fallback
