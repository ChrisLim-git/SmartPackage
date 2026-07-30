"use client"

import { useQuery } from "@tanstack/react-query"

import type { LockerSizeDto } from "@dtos/master-data"

import { queryKeys, readJson } from "./api"

/** The size ladder, in rank order — the order the API returns it in. */
export const useLockerSizes = () =>
  useQuery({
    queryKey: queryKeys.lockerSizes,
    queryFn: () => readJson<LockerSizeDto[]>("/api/locker-sizes"),
  })
