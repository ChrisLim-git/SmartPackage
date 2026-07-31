"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { del, queryKeys } from "./api"

/** Deletes every parcel and frees every locker. */
export const useResetDemoParcels = () => {
  const queries = useQueryClient()

  return useMutation({
    mutationFn: () => del<{ removed: number }>("/demo/parcels"),
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.demoParcels })
      void queries.invalidateQueries({ queryKey: queryKeys.lockers })
    },
  })
}
