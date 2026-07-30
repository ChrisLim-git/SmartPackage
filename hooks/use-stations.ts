"use client"

import { useQuery } from "@tanstack/react-query"

import type { StationDto } from "@dtos/master-data"

import { get, queryKeys } from "./api"

/** Every station in the network. Master data, so it changes about never. */
export const useStations = () =>
  useQuery({
    queryKey: queryKeys.stations,
    queryFn: () => get<StationDto[]>("/stations"),
  })
