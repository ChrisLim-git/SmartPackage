"use client"

import { useQuery } from "@tanstack/react-query"

import type { LockerDto } from "@dtos/master-data"

import { queryKeys, readJson } from "./api"

/**
 * Every locker with its current status, occupied ones included.
 *
 * An operator looking at a station needs to see that it is full rather than see
 * an empty page, which is why this is not scoped to what is available.
 */
export const useLockers = () =>
  useQuery({
    queryKey: queryKeys.lockers,
    queryFn: () => readJson<LockerDto[]>("/api/lockers"),
  })
