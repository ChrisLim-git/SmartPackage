"use client"

import { useQuery } from "@tanstack/react-query"

import type { LockerSizeDto } from "@dtos/master-data"

import { get, queryKeys } from "./api"

/** The size ladder, in rank order — the order the API returns it in. */
export const useLockerSizes = () =>
  useQuery({
    queryKey: queryKeys.lockerSizes,
    queryFn: () => get<LockerSizeDto[]>("/locker-sizes"),
  })
