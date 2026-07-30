import type { Clock } from "../ports/clock"
import type { PickupCodeHasher } from "../ports/pickup-code-hasher"
import {
  type MalformedInput,
  malformedInput,
  type PackageAlreadyRetrieved,
  packageAlreadyRetrieved,
} from "../shared/errors"
import { err, ok, type Result } from "../shared/result"
import type { Money } from "../value-objects/money"
import type { PickupCode } from "../value-objects/pickup-code"
import type { PackageSize } from "../value-objects/size"

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
 * A parcel in a locker. Stored once, collected once.
 *
 * `retrieved` is terminal, and that one fact covers two of the invalid
 * collection scenarios the specification leaves unenumerated: replaying a
 * pickup code, and collecting the same package twice.
 *
 * The pickup code is held only as a hash. It is a bearer credential for a
 * physical object, so plaintext at rest would make one `SELECT` a master key to
 * every occupied locker.
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
        // From the port, never `new Date()`: a seven-day stay has to be
        // testable in a millisecond.
        attributes.clock.now(),
        null,
        null
      )
    )
  }

  /** Constant-time comparison, delegated to the hasher — the domain never sees the algorithm. */
  verifyCode(code: PickupCode, hasher: PickupCodeHasher): boolean {
    return hasher.matches(code, this.pickupCodeHash)
  }

  /**
   * Checked separately from the code so a right-code-wrong-locker attempt is
   * distinguishable in a log and a test, even though it flattens to the same
   * response as every other rejected collection.
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
        // Kept, not overwritten: the audit trail has to survive collection.
        this.storedAt,
        at,
        fee
      )
    )
  }
}
