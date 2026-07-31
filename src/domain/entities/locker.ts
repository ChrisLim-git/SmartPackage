import type { LockerFitService } from "../services/locker-fit-service"
import {
  type LockerAlreadyOccupied,
  lockerAlreadyOccupied,
  type LockerNotOccupied,
  lockerNotOccupied,
  type MalformedInput,
  malformedInput,
} from "../shared/errors"
import { err, isErr, ok, type Result } from "../shared/result"
import type { LockerSize, PackageSize } from "../utils/size"

export type LockerStatus = "available" | "occupied"

export type LockerAttributes = {
  readonly id: string
  readonly stationId: string
  readonly size: LockerSize
  readonly label: string
}

/**
 * A locker — the consistency boundary: at most one package per locker at any time.
 * Transitions return a new `Locker`; the race is settled at the database row.
 */
export class Locker {
  private constructor(
    readonly id: string,
    readonly stationId: string,
    readonly size: LockerSize,
    readonly label: string,
    readonly status: LockerStatus,
    readonly currentPackageId: string | null
  ) {}

  static create(attributes: LockerAttributes): Result<Locker, MalformedInput> {
    const label = attributes.label.trim()

    if (attributes.id.trim().length === 0) {
      return err(malformedInput("locker", "an id is required"))
    }
    if (attributes.stationId.trim().length === 0) {
      return err(malformedInput("locker", "a station is required"))
    }
    if (label.length === 0) {
      return err(malformedInput("locker", "a label is required"))
    }

    return ok(
      new Locker(
        attributes.id,
        attributes.stationId,
        attributes.size,
        label,
        "available",
        null
      )
    )
  }

  /**
   * Rebuilds a persisted locker in whatever state it was left in — the only
   * path that can produce an occupied locker without a transition.
   */
  static rehydrate(
    attributes: LockerAttributes & {
      readonly status: LockerStatus
      readonly currentPackageId: string | null
    }
  ): Result<Locker, MalformedInput> {
    const created = Locker.create(attributes)

    if (isErr(created)) {
      return created
    }

    return ok(
      new Locker(
        created.value.id,
        created.value.stationId,
        created.value.size,
        created.value.label,
        attributes.status,
        attributes.currentPackageId
      )
    )
  }

  isAvailable(): boolean {
    return this.status === "available"
  }

  /** Capacity only. Whether the locker is free is a separate question, and the selection service asks both. */
  canAccommodate(
    requirement: PackageSize,
    fitService: LockerFitService
  ): boolean {
    return fitService.fits(this.size, requirement)
  }

  occupy(packageId: string): Result<Locker, LockerAlreadyOccupied> {
    if (this.status === "occupied") {
      // Even for the same package: a double-store is not success.
      return err(lockerAlreadyOccupied(this.id))
    }

    return ok(
      new Locker(
        this.id,
        this.stationId,
        this.size,
        this.label,
        "occupied",
        packageId
      )
    )
  }

  release(): Result<Locker, LockerNotOccupied> {
    if (this.status === "available") {
      return err(lockerNotOccupied(this.id))
    }

    return ok(
      new Locker(
        this.id,
        this.stationId,
        this.size,
        this.label,
        "available",
        null
      )
    )
  }
}
