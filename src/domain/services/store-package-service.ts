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
  malformedInput,
  type NoSuitableLockerAvailable,
  noSuitableLockerAvailable,
  type StationNotFound,
  stationNotFound,
} from "../shared/errors"
import { err, isErr, ok, type Result } from "../shared/result"
import { PackageSize } from "../utils/size"

export type StorePackageCommand = {
  readonly stationId: string
  readonly recipient: {
    readonly name: string
    readonly email: string
    readonly phone?: string | null
  }
  /**
   * The size **code** an agent picked, not a value object.
   *
   * The ladder is master data, so turning a code into a size is a lookup the
   * domain can do and the route cannot — which is what keeps the handler a strip
   * that guards, validates, delegates and maps.
   */
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
 * The repositories that must share a transaction arrive through the
 * `UnitOfWork`, not as constructor arguments beside it. Injecting both would put
 * two handles on the same table in one service, and the second write to escape
 * the transaction would be silent.
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

export type StorePackageFailure =
  StationNotFound | NoSuitableLockerAvailable | MalformedInput

/**
 * Level 1, orchestrated: an agent hands over a package and gets back a locker
 * to put it in and a code to pass on.
 *
 * A domain service rather than a use case in a layer above, because the
 * repository and `UnitOfWork` contracts are declared in the domain — so this
 * class coordinates a whole flow while importing nothing outside it, and its
 * tests run against in-memory fakes in microseconds.
 */
export class StorePackageService {
  constructor(private readonly dependencies: StorePackageDependencies) {}

  async execute(
    command: StorePackageCommand
  ): Promise<Result<StoredPackage, StorePackageFailure>> {
    const { stations, codes, hasher, ids, clock, uow } = this.dependencies

    if ((await stations.findById(command.stationId)) === null) {
      // Checked before anything is claimed: a package cannot be stored at a
      // station that does not exist, and saying so is not the same answer as
      // "the station is full".
      return err(stationNotFound(command.stationId))
    }

    const size = await this.resolveSize(command.packageSizeCode)
    if (isErr(size)) return size

    return uow.run<Result<StoredPackage, StorePackageFailure>>(
      async ({ lockers, packages, customers }) => {
        // The locker is claimed first, before the recipient exists, because it is
        // the only contended resource here: failing fast on it means a store that
        // cannot happen leaves nothing behind, not even a customer row.
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
          // Unreachable: every field it validates was produced above. A throw
          // rather than an `Err` because this would be a bug in this service,
          // and because it rolls the claim back instead of committing a locker
          // holding nothing.
          throw new Error(
            `a stored package could not be built: ${parcel.error.message}`
          )
        }

        await packages.save(parcel.value, command.audit)

        return ok({
          lockerLabel: locker.label,
          pickupCode: code.toString(),
          storedAt: parcel.value.storedAt,
        })
      }
    )
  }

  /**
   * The code an agent chose, against the ladder master data actually holds.
   *
   * An unknown code is malformed input rather than a missing locker: the station
   * may be wide open, and telling the caller it is full would be a lie about
   * their own typo.
   */
  private async resolveSize(
    code: string
  ): Promise<Result<PackageSize, MalformedInput>> {
    const ladder = await this.dependencies.lockerSizes.findAll()
    const match = ladder.find((size) => size.code === code)

    if (match === undefined) {
      return err(
        malformedInput(
          "packageSize",
          `"${code}" is not a package size — known sizes are ${ladder
            .map((size) => size.code)
            .join(", ")}`
        )
      )
    }

    // A locker's capacity and a package's requirement are deliberately not
    // assignable to each other, so the ladder row is rebuilt as the one this
    // flow needs rather than passed through.
    return PackageSize.create(match)
  }
}
