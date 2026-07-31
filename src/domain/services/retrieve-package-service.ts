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
import type { ChargedBand, StorageFeeService } from "./storage-fee-service"

export type RetrievePackageCommand = {
  /** The whole request: the code identifies the parcel on its own — no station, no locker number. */
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
  /** Bands travel with the fee so a display never re-derives — and never contradicts — the charge. */
  readonly bands: readonly ChargedBand[]
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
 * Collects a parcel by pickup code and prices the stay. All rejections except
 * a malformed code return one indistinguishable error, so callers cannot probe
 * which codes are live.
 */
export class RetrievePackageService {
  constructor(private readonly dependencies: RetrievePackageDependencies) {}

  async execute(
    command: RetrievePackageCommand
  ): Promise<Result<RetrievedPackage, RetrievePackageFailure>> {
    const { pricing, fees, hasher, clock, uow } = this.dependencies

    const code = PickupCode.create(command.pickupCode)
    if (isErr(code)) {
      // A malformed code is rejected before any lookup.
      return err(code.error)
    }

    const config = await pricing.currentConfig()

    return uow.run<Result<RetrievedPackage, RetrievePackageFailure>>(
      async ({ lockers, packages }) => {
        // Looked up by hash and scoped to `stored`; the row is held for this
        // unit of work, so a lost race reads the same `null` a replay does.
        const parcel = await packages.findStoredByCodeHash(
          hasher.hash(code.value)
        )

        if (parcel === null) {
          return err(invalidPickupRequest())
        }

        const locker = await lockers.findById(parcel.lockerId)

        if (locker === null) {
          // A stored parcel always has a locker (foreign key); this is a data fault, not a bad request.
          throw new Error(
            `package ${parcel.id} is in locker ${parcel.lockerId}, which no longer exists`
          )
        }

        const retrievedAt = clock.now()
        const duration = StorageDuration.from(parcel.storedAt, retrievedAt)
        if (isErr(duration)) {
          return err(duration.error)
        }

        const priced = fees.calculate(duration.value, config)

        const collected = parcel.retrieve(retrievedAt, priced.total)
        if (isErr(collected)) {
          return err(collected.error)
        }

        // Locker first, then parcel: both writes share one transaction, but the
        // order decides what a mid-flight failure leaves behind.
        await lockers.release(locker.id, command.audit)

        const written = await packages.save(collected.value, command.audit)
        if (!written) {
          // Broken repository contract: the locker is already released in this
          // transaction, so the throw must roll both writes back.
          throw new Error(
            `package ${collected.value.id} could not be marked retrieved`
          )
        }

        return ok({
          packageId: collected.value.id,
          lockerLabel: locker.label,
          fee: priced.total,
          retrievedAt,
          storedAt: parcel.storedAt,
          // Returned so a display never re-derives days or rates.
          chargeableDays: duration.value.chargeableDays,
          bands: priced.bands,
        })
      }
    )
  }
}
