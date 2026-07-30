"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

/**
 * Mounted here rather than in T204, where it would have been a data layer with
 * nothing to fetch. The first screen that actually queries is the admin one.
 *
 * The client is built in `useState` rather than at module scope: a module-level
 * client is shared by every request the server handles, so one user's cached
 * data can be handed to the next.
 */
export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Reference data changes when an administrator changes it, not on
            // a timer. Refetching because a window regained focus would be
            // network traffic bought with nothing.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      })
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
