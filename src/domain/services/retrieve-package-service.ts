import type { AuditContext } from "../interfaces/audit-context"
import type { Clock } from "../interfaces/clock"
import type { PickupCodeHasher } from "../interfaces/pickup-code-hasher"
import type { PricingRepository } from "../interfaces/pricing-repository"
import type { UnitOfWork } from "../interfaces/unit-of-work"
import {
  type InvalidPickupRequest,
  invalidPickupRequest,
  type MalformedInput,
  type PackageAlreadyRetrieved,
} from "../shared/errors"
import { err, isErr, ok, type Result } from "../shared/result"
import type { Money } from "../utils/money"
import { PickupCode } from "../utils/pickup-code"
import { StorageDuration } from "../utils/storage-duration"
import type { StorageFeeService } from "./storage-fee-service"

export type RetrievePackageCommand = {
  readonly stationId: string
  /** What is written on the locker door, which is only unique at one station. */
  readonly lockerLabel: string
  readonly pickupCode: string
  readonly audit: AuditContext
}

export type RetrievedPackage = {
  readonly packageId: string
  readonly fee: Money
  readonly retrievedAt: Date
}

export type RetrievePackageDependencies = {
  readonly pricing: PricingRepository
  readonly fees: StorageFeeService
  readonly hasher: PickupCodeHasher
  readonly clock: Clock
  readonly uow: UnitOfWork
}

export type RetrievePackageFailure =
  InvalidPickupRequest | MalformedInput | PackageAlreadyRetrieved

/**
 * Levels 2 and 3, orchestrated: a code opens one locker, once, and the stay is
 * priced on the way out.
 *
 * Four separate things can be wrong with a collection — the label, the code, the
 * pairing of the two, and whether anything is in there — and all four answer
 * `InvalidPickupRequest`, with no detail attached. A caller able to tell them
 * apart could walk the label space and learn which lockers exist and which hold
 * a parcel, which is a map of what is worth breaking into.
 *
 * A malformed code is the one exception, because the shape of the input is
 * something the person already knows: it says nothing about the estate.
 */
export class RetrievePackageService {
  constructor(private readonly dependencies: RetrievePackageDependencies) {}

  async execute(
    command: RetrievePackageCommand
  ): Promise<Result<RetrievedPackage, RetrievePackageFailure>> {
    const { pricing, fees, hasher, clock, uow } = this.dependencies

    const code = PickupCode.create(command.pickupCode)
    if (isErr(code)) {
      // Before any lookup: a code that cannot be a code is a typo, and there is
      // nothing to check it against.
      return err(code.error)
    }

    const config = await pricing.currentConfig()

    return uow.run<Result<RetrievedPackage, RetrievePackageFailure>>(
      async ({ lockers, packages }) => {
        const locker = await lockers.findByLabel(
          command.stationId,
          command.lockerLabel
        )

        if (locker === null) {
          return err(invalidPickupRequest())
        }

        const parcel = await packages.findStoredByLockerId(locker.id)

        // Scoped to a stored parcel, which is what makes a replayed code
        // indistinguishable from a wrong one: once collected, the package is no
        // longer in the locker as far as this query is concerned.
        if (parcel === null) {
          return err(invalidPickupRequest())
        }

        if (
          !parcel.verifyCode(code.value, hasher) ||
          !parcel.matchesLocker(locker.id)
        ) {
          return err(invalidPickupRequest())
        }

        const retrievedAt = clock.now()
        const duration = StorageDuration.from(parcel.storedAt, retrievedAt)
        if (isErr(duration)) {
          return err(duration.error)
        }

        const fee = fees.calculate(duration.value, config)

        const collected = parcel.retrieve(retrievedAt, fee)
        if (isErr(collected)) {
          return err(collected.error)
        }

        // The locker first, then the parcel. Both writes are in one
        // transaction, so the order cannot change what commits — but it does
        // decide what a failure leaves behind for anything that is not
        // transactional, and a parcel recorded as collected behind a locker
        // that is still occupied is the worst state this system can reach: the
        // locker is dead and the package is gone from the system.
        await lockers.release(locker.id, command.audit)
        await packages.save(collected.value, command.audit)

        return ok({
          packageId: collected.value.id,
          fee,
          retrievedAt,
        })
      }
    )
  }
}
