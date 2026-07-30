"use client"

import { useMutation } from "@tanstack/react-query"

import type { CollectedPackageDto, StoredPackageDto } from "@dtos/package"

import { postJson } from "./api"

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
 * and the response carries the only two facts that matter — the locker and the
 * code, the second of which is never retrievable again.
 */
export const useStorePackage = () =>
  useMutation({
    mutationFn: (request: StoreRequest) =>
      postJson<StoredPackageDto>("/api/packages", request),
  })

/**
 * A recipient collecting one, with six digits and no session.
 *
 * The mutation *is* the collection — by the time it resolves the parcel is
 * recorded as collected and the locker is free — so its result is the receipt,
 * and the QR in it is the handoff to the kiosk.
 */
export const useCollectPackage = () =>
  useMutation({
    mutationFn: (pickupCode: string) =>
      postJson<CollectedPackageDto>("/api/pickups", { pickupCode }),
  })
