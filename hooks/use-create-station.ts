"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import type { StationDto } from "@dtos/master-data"

import { post, queryKeys } from "./api"

export type NewStation = {
  name: string
  address: string
}

/**
 * Brings a station online.
 *
 * The key it invalidates comes from the same object `useStations` reads its key
 * from, so the two cannot drift — which is the bug where a new station does not
 * appear in the station picker until someone reloads the page.
 */
export const useCreateStation = () => {
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (details: NewStation) => post<StationDto>("/stations", details),
    onSuccess: () =>
      queries.invalidateQueries({ queryKey: queryKeys.stations }),
  })
}
