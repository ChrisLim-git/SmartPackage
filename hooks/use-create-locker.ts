"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import type { LockerDto } from "@dtos/master-data"

import { postJson, queryKeys } from "./api"

export type NewLocker = {
  stationId: string
  sizeCode: string
  label: string
}

/**
 * Installs a locker at a station.
 *
 * The key it invalidates comes from the same object `useLockers` reads its key
 * from, so the two cannot drift — which is the bug where a created locker does
 * not appear until someone reloads the page.
 */
export const useCreateLocker = () => {
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (details: NewLocker) =>
      postJson<LockerDto>("/api/lockers", details),
    onSuccess: () => queries.invalidateQueries({ queryKey: queryKeys.lockers }),
  })
}
