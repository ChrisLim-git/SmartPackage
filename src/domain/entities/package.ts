import type { Clock } from "../interfaces/clock"
import type { PickupCodeHasher } from "../interfaces/pickup-code-hasher"
import {
  type MalformedInput,
  malformedInput,
  type PackageAlreadyRetrieved,
  packageAlreadyRetrieved,
} from "../shared/errors"
import { err, ok, type Result } from "../shared/result"
import type { Money } from "../utils/money"
import type { PickupCode } from "../utils/pickup-code"
import type { PackageSize } from "../utils/size"

export type PackageStatus = "stored" | "retrieved"

export type StorePackageAttributes = {
  readonly id: string
  readonly customerId: string
  readonly size: PackageSize
  readonly lockerId: string
  readonly code: PickupCode
  readonly hasher: PickupCodeHasher
  readonly clock: Clock
}

/**
 * A parcel in a locker; stored once, collected once — `retrieved` is terminal.
 * The pickup code is held only as a hash; plaintext is never at rest.
 */
export class Package {
  private constructor(
    readonly id: string,
    readonly customerId: string,
    readonly size: PackageSize,
    readonly lockerId: string,
    readonly pickupCodeHash: string,
    readonly status: PackageStatus,
    readonly storedAt: Date,
    readonly retrievedAt: Date | null,
    readonly feeCharged: Money | null
  ) {}

  static store(
    attributes: StorePackageAttributes
  ): Result<Package, MalformedInput> {
    if (attributes.id.trim().length === 0) {
      return err(malformedInput("package", "an id is required"))
    }
    if (attributes.customerId.trim().length === 0) {
      return err(malformedInput("package", "a customer is required"))
    }
    if (attributes.lockerId.trim().length === 0) {
      return err(malformedInput("package", "a locker is required"))
    }

    return ok(
      new Package(
        attributes.id,
        attributes.customerId,
        attributes.size,
        attributes.lockerId,
        attributes.hasher.hash(attributes.code),
        "stored",
        attributes.clock.now(),
        null,
        null
      )
    )
  }

  /**
   * Rebuilds a persisted parcel in whatever state it was left in; `store` only
   * makes `stored` ones. The hash arrives already hashed.
   */
  static rehydrate(attributes: {
    readonly id: string
    readonly customerId: string
    readonly size: PackageSize
    readonly lockerId: string
    readonly pickupCodeHash: string
    readonly status: PackageStatus
    readonly storedAt: Date
    readonly retrievedAt: Date | null
    readonly feeCharged: Money | null
  }): Result<Package, MalformedInput> {
    if (attributes.id.trim().length === 0) {
      return err(malformedInput("package", "an id is required"))
    }

    return ok(
      new Package(
        attributes.id,
        attributes.customerId,
        attributes.size,
        attributes.lockerId,
        attributes.pickupCodeHash,
        attributes.status,
        attributes.storedAt,
        attributes.retrievedAt,
        attributes.feeCharged
      )
    )
  }

  /** Constant-time comparison, delegated to the hasher — the domain never sees the algorithm. */
  verifyCode(code: PickupCode, hasher: PickupCodeHasher): boolean {
    return hasher.matches(code, this.pickupCodeHash)
  }

  /**
   * Separate from the code check so a right-code-wrong-locker attempt is
   * distinguishable in logs, though it flattens to the same response.
   */
  matchesLocker(lockerId: string): boolean {
    return this.lockerId === lockerId
  }

  retrieve(
    at: Date,
    fee: Money
  ): Result<Package, PackageAlreadyRetrieved | MalformedInput> {
    if (this.status === "retrieved") {
      return err(packageAlreadyRetrieved(this.id))
    }
    if (at.getTime() < this.storedAt.getTime()) {
      return err(
        malformedInput(
          "package",
          "a package cannot be collected before it was stored"
        )
      )
    }

    return ok(
      new Package(
        this.id,
        this.customerId,
        this.size,
        this.lockerId,
        this.pickupCodeHash,
        "retrieved",
        // Kept, not overwritten: the audit trail survives collection.
        this.storedAt,
        at,
        fee
      )
    )
  }
}
