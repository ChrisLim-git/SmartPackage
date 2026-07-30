import type { LockerFitPolicy } from "../policies/locker-fit-policy"
import {
  type LockerAlreadyOccupied,
  lockerAlreadyOccupied,
  type LockerNotOccupied,
  lockerNotOccupied,
  type MalformedInput,
  malformedInput,
} from "../shared/errors"
import { err, ok, type Result } from "../shared/result"
import type { LockerSize, PackageSize } from "../value-objects/size"

export type LockerStatus = "available" | "occupied"

export type LockerAttributes = {
  readonly id: string
  readonly stationId: string
  readonly size: LockerSize
  readonly label: string
}

/**
 * A single locker, and the consistency boundary of the whole system: **at most
 * one package occupies a locker at any time.**
 *
 * The state machine is deliberately two states. Transitions return a new
 * `Locker` rather than mutating this one — a mutable entity shared between two
 * concurrent store requests would resolve the collision inside JavaScript
 * object state, where it looks solved, instead of at the database row, which is
 * the only place it actually is.
 *
 * An illegal transition is an `Err`, not a throw. Under contention, losing a
 * race for a locker is an ordinary outcome.
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
      // The label is how a person finds the locker in front of them.
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

  isAvailable(): boolean {
    return this.status === "available"
  }

  /** Capacity only. Whether the locker is free is a separate question, and the selection policy asks both. */
  canAccommodate(
    requirement: PackageSize,
    fitPolicy: LockerFitPolicy
  ): boolean {
    return fitPolicy.fits(this.size, requirement)
  }

  occupy(packageId: string): Result<Locker, LockerAlreadyOccupied> {
    if (this.status === "occupied") {
      // Including when it is the same package. Treating that as success would
      // report a double-store as fine and lose track of the first package.
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
