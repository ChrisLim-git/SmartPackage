import axios, { AxiosError } from "axios"

import type { ErrorDto } from "@dtos/http-error"

/**
 * The one client every hook talks through.
 *
 * `baseURL` is `/api`, so a hook names a resource — `/stations` — rather than
 * repeating the prefix at each call site and getting it slightly wrong once.
 *
 * The interceptor is the reason this is worth a client at all: the API answers
 * every failure with `{ error: { code, message } }`, and that unwrapping used to
 * be repeated in each caller. Here it happens once, so a hook's rejection is
 * already the sentence a person should read — which is what lets a form put the
 * message straight against the field it belongs to.
 */
const client = axios.create({
  baseURL: "/api",
  headers: { "content-type": "application/json" },
})

client.interceptors.response.use(
  (response) => response,
  (failure: AxiosError<ErrorDto>) => {
    const written = failure.response?.data?.error?.message

    // A network failure or a response that is not our envelope has no sentence
    // to lift, so it keeps axios' own message rather than being flattened into
    // something vaguer. Either way the caller gets an `Error` and never an
    // axios shape, so nothing above this line knows which client is underneath.
    throw new Error(written ?? failure.message)
  }
)

export const get = async <T>(path: string): Promise<T> =>
  (await client.get<T>(path)).data

export const post = async <T>(path: string, body: unknown): Promise<T> =>
  (await client.post<T>(path, body)).data

export const del = async <T>(path: string): Promise<T> =>
  (await client.delete<T>(path)).data

/** One place for the keys, so an invalidation and a query cannot drift apart. */
export const queryKeys = {
  stations: ["stations"] as const,
  lockerSizes: ["locker-sizes"] as const,
  lockers: ["lockers"] as const,
  demoParcels: ["demo-parcels"] as const,
}
