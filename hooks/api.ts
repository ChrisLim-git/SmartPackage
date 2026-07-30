/**
 * The two things every hook in this folder does with the API.
 *
 * `readJson` throws the message the route wrote rather than a status code: the
 * error taxonomy already decided what a person should be told, and a component
 * repeating "the server answered 409" would be inventing a worse version of it.
 */
export const readJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const postJson = async <T>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    // The envelope every failure uses: `{ error: { code, message } }`. Carried up
    // so a form can put the sentence against the field it belongs to.
    throw new Error(
      payload?.error?.message ?? `The server answered ${response.status}.`
    )
  }

  return payload as T
}

/** One place for the keys, so an invalidation and a query cannot drift apart. */
export const queryKeys = {
  stations: ["stations"] as const,
  lockerSizes: ["locker-sizes"] as const,
  lockers: ["lockers"] as const,
}
