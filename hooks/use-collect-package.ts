"use client"

import { useMutation } from "@tanstack/react-query"

import type { CollectedPackageDto } from "@dtos/package"

import { postJson } from "./api"

/**
 * A recipient collecting a parcel, with six digits and no session.
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
