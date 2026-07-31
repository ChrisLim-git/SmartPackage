import { Package } from "../entities/package"
import type { AuditContext } from "../interfaces/audit-context"
import type { Clock } from "../interfaces/clock"
import type { IdGenerator } from "../interfaces/id-generator"
import type { PickupCodeGenerator } from "../interfaces/pickup-code-generator"
import type {
  LockerSizeRepository,
  StationRepository,
} from "../interfaces/repository"
import type { PickupCodeHasher } from "../interfaces/pickup-code-hasher"
import type { UnitOfWork } from "../interfaces/unit-of-work"
import {
  type MalformedInput,
  type NoSuitableLockerAvailable,
  noSuitableLockerAvailable,
  type StationNotFound,
  stationNotFound,
} from "../shared/errors"
import { err, isErr, ok, type Result } from "../shared/result"
import { findSizeByCode, PackageSize } from "../utils/size"

export type StorePackageCommand = {
  readonly stationId: string
  readonly recipient: {
    readonly name: string
    readonly email: string
    readonly phone?: string | null
  }
  /** The size code an agent picked; resolving it to a size is the domain's lookup. */
  readonly packageSizeCode: string
  readonly audit: AuditContext
}

export type StoredPackage = {
  readonly lockerLabel: string
  /** Plaintext, handed back once and never again: only the hash is persisted. */
  readonly pickupCode: string
  readonly storedAt: Date
}

/**
 * Repositories that must share a transaction arrive through the `UnitOfWork`,
 * never as constructor arguments beside it.
 */
export type StorePackageDependencies = {
  readonly stations: StationRepository
  readonly lockerSizes: LockerSizeRepository
  readonly codes: PickupCodeGenerator
  readonly hasher: PickupCodeHasher
  readonly ids: IdGenerator
  readonly clock: Clock
  readonly uow: UnitOfWork
}

/** Enough that exhausting them means a broken generator, not bad luck. */
const CODE_ATTEMPTS = 5

export type StorePackageFailure =
  StationNotFound | NoSuitableLockerAvailable | MalformedInput

/**
 * Stores a package: claims a locker, records the parcel, and returns the
 * locker label with the one-time pickup code.
 */
export class StorePackageService {
  constructor(private readonly dependencies: StorePackageDependencies) {}

  async execute(
    command: StorePackageCommand
  ): Promise<Result<StoredPackage, StorePackageFailure>> {
    const { stations, codes, hasher, ids, clock, uow } = this.dependencies

    if ((await stations.findById(command.stationId)) === null) {
      // Checked before anything is claimed: "no station" is not "station full".
      return err(stationNotFound(command.stationId))
    }

    const size = await this.resolveSize(command.packageSizeCode)
    if (isErr(size)) return size

    return uow.run<Result<StoredPackage, StorePackageFailure>>(
      async ({ lockers, packages, customers }) => {
        // The claim and the parcel write commit together or not at all. The
        // locker is claimed first because it is the only contended resource.
        const locker = await lockers.claimSmallestFitting(
          command.stationId,
          size.value,
          command.audit
        )

        if (locker === null) {
          return err(noSuitableLockerAvailable(command.stationId))
        }

        const recipient = await customers.findOrCreateByEmail(
          command.recipient,
          command.audit
        )

        // No two stored parcels may share a code; the unique index decides, and
        // this loop turns a collision into another code.
        for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
          const code = codes.generate()

          const parcel = Package.store({
            id: ids.next(),
            customerId: recipient.id,
            size: size.value,
            lockerId: locker.id,
            code,
            hasher,
            clock,
          })

          if (isErr(parcel)) {
            // Unreachable: every field was produced above. The throw rolls the claim back.
            throw new Error(
              `a stored package could not be built: ${parcel.error.message}`
            )
          }

          if (await packages.save(parcel.value, command.audit)) {
            return ok({
              lockerLabel: locker.label,
              pickupCode: code.toString(),
              storedAt: parcel.value.storedAt,
            })
          }
        }

        // Every attempt collided: a broken generator, not bad luck.
        throw new Error(
          `could not find an unused pickup code in ${CODE_ATTEMPTS} attempts`
        )
      }
    )
  }

  /** An unknown size code is malformed input, not a missing locker. */
  private async resolveSize(
    code: string
  ): Promise<Result<PackageSize, MalformedInput>> {
    const match = findSizeByCode(
      await this.dependencies.lockerSizes.findAll(),
      code,
      "packageSize"
    )

    if (isErr(match)) return match

    // Capacity and requirement are not assignable, so the ladder row is rebuilt as a PackageSize.
    return PackageSize.create(match.value)
  }
}
