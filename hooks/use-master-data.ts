"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { LockerDto, LockerSizeDto, StationDto } from "@dtos/master-data"

import { postJson, queryKeys, readJson } from "./api"

/**
 * The admin surface's reads and its one write.
 *
 * Every query and mutation in the app lives in this folder rather than inside the
 * component that renders the result. Two reasons: a component then has one job,
 * and a cache key appears exactly once — the invalidation below and the query it
 * refreshes cannot drift apart, which is the bug where a created locker does not
 * show up until a manual reload.
 */
export const useStations = () =>
  useQuery({
    queryKey: queryKeys.stations,
    queryFn: () => readJson<StationDto[]>("/api/stations"),
  })

export const useLockerSizes = () =>
  useQuery({
    queryKey: queryKeys.lockerSizes,
    queryFn: () => readJson<LockerSizeDto[]>("/api/locker-sizes"),
  })

export const useLockers = () =>
  useQuery({
    queryKey: queryKeys.lockers,
    queryFn: () => readJson<LockerDto[]>("/api/lockers"),
  })

export type NewLocker = {
  stationId: string
  sizeCode: string
  label: string
}

export const useCreateLocker = () => {
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (details: NewLocker) =>
      postJson<LockerDto>("/api/lockers", details),
    // The new locker appears without anyone reaching for refresh.
    onSuccess: () => queries.invalidateQueries({ queryKey: queryKeys.lockers }),
  })
}
