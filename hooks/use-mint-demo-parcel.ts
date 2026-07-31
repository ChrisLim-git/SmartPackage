"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { post, queryKeys } from "./api"
import type { DemoParcelDto } from "./use-demo-parcels"

/** Stores a test parcel, optionally backdated, and returns its plaintext code. */
export const useMintDemoParcel = () => {
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (daysAgo: number) =>
      post<DemoParcelDto>("/demo/parcels", { daysAgo }),
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.demoParcels })
      void queries.invalidateQueries({ queryKey: queryKeys.lockers })
    },
  })
}
