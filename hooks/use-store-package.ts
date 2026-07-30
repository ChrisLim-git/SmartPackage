"use client"

import { useMutation } from "@tanstack/react-query"

import type { StoredPackageDto } from "@dtos/package"

import { post } from "./api"

export type StoreRequest = {
  stationId: string
  packageSizeCode: string
  recipient: {
    name: string
    email: string
    phone: string | null
  }
}

/**
 * An agent handing a parcel over.
 *
 * No cache to invalidate: nothing on the agent surface reads a list of packages,
 * and the response carries the only two facts that matter — the locker, and the
 * code, which is never retrievable again.
 */
export const useStorePackage = () =>
  useMutation({
    mutationFn: (request: StoreRequest) =>
      post<StoredPackageDto>("/packages", request),
  })
