import type { AuditContext } from "../interfaces/audit-context"
import type { Clock } from "../interfaces/clock"
import type { PickupCodeHasher } from "../interfaces/pickup-code-hasher"
import type { PricingRepository } from "../interfaces/repository"
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
  /**
   * Six digits, and the whole request.
   *
   * The recipient has a code in a message and nothing else — no account, no
   * station, no locker number — so the code has to identify the parcel by itself.
   * Asking for the locker number as well would mean a person standing in front of
   * a wall of doors transcribing one before anything can happen.
   */
  readonly pickupCode: string
  readonly audit: AuditContext
}

export type RetrievedPackage = {
  readonly packageId: string
  readonly lockerLabel: string
  readonly fee: Money
  readonly retrievedAt: Date
  readonly storedAt: Date
  readonly chargeableDays: number
  /**
   * The two numbers a customer needs to read the total back.
   *
   * A charge nobody can reconstruct is where trust breaks at a locker wall, so
   * the daily rate and the day the rate first rises travel with the fee rather
   * than being re-derived by whoever renders it — a second derivation is a second
   * chance to disagree with the invoice.
   */
  readonly baseRate: Money
  readonly firstTierEndsOnDay: number | null
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
 * Two things can be wrong with a collection — the code is not a code, or it does
 * not match a parcel awaiting collection — and only the first is described back.
 * A wrong code, a code for a parcel already collected, and a code that never
 * existed are one answer carrying no detail, because a caller able to tell them
 * apart could learn which codes are live.
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
        // By hash, because the plaintext is never stored — the same HMAC that
        // wrote the column reads it back. Scoped to a stored parcel, which is
        // what makes a replayed code indistinguishable from a wrong one.
        const parcel = await packages.findStoredByCodeHash(
          hasher.hash(code.value)
        )

        if (parcel === null) {
          return err(invalidPickupRequest())
        }

        const locker = await lockers.findById(parcel.lockerId)

        if (locker === null) {
          // A stored parcel always has a locker — the foreign key says so.
          // Reaching here means the locker was soft-deleted underneath a stored
          // parcel, which is a data problem rather than a bad request, and
          // answering anything else would be inventing a state.
          throw new Error(
            `package ${parcel.id} is in locker ${parcel.lockerId}, which no longer exists`
          )
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

        // The locker first, then the parcel. Both writes are in one transaction,
        // so the order cannot change what commits — but it does decide what a
        // failure leaves behind for anything that is not transactional, and a
        // parcel recorded as collected behind a locker that is still occupied is
        // the worst state this system can reach: the locker is dead and the
        // package is gone from the system.
        await lockers.release(locker.id, command.audit)
        await packages.save(collected.value, command.audit)

        return ok({
          packageId: collected.value.id,
          lockerLabel: locker.label,
          fee,
          retrievedAt,
          storedAt: parcel.storedAt,
          // Returned rather than left to whoever displays it: the fee is
          // explained to the customer in days, and two implementations of "how
          // many days is that" would eventually disagree with the invoice.
          chargeableDays: duration.value.chargeableDays,
          baseRate: config.baseRate,
          firstTierEndsOnDay: config.tiers[0].toDay,
        })
      }
    )
  }
}
