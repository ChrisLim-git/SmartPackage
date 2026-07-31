"use client"

import { useQuery } from "@tanstack/react-query"

import { get, queryKeys } from "./api"

export type DemoParcelDto = {
  pickupCode: string
  lockerLabel: string
  stationName: string
  recipientName: string
  storedAt: string
  daysAgo: number
}

/** Test parcels minted this session that are still uncollected. */
export const useDemoParcels = (enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.demoParcels,
    queryFn: () => get<DemoParcelDto[]>("/demo/parcels"),
    enabled,
  })
