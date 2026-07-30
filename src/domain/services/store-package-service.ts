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

/** Enough that exhausting them means a broken generator, not bad luck. */
const CODE_ATTEMPTS = 5

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
        // The claim is inside this transaction on purpose, and it is the one place
        // that decision is visible: claiming a locker and recording the parcel in
        // it commit together, or neither does. Claim-then-commit-then-insert would
        // leave a locker marked occupied with nothing inside it the first time an
        // insert failed, and nothing to release it — a dead locker and a parcel
        // the system never heard of. The row lock is held across two indexed
        // single-row writes, and `SKIP LOCKED` means a concurrent agent takes the
        // next locker rather than waiting behind this one.
        //
        // The locker comes first within the transaction, before the recipient
        // exists, because it is the only contended resource: failing fast on it
        // means a store that cannot happen leaves nothing behind, not even a
        // customer row.
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

        // A code is the entire credential — the recipient types six characters and
        // nothing else — so no two parcels awaiting collection may share one. The
        // database refuses the duplicate; this loop is what turns that refusal
        // into another code rather than a failed delivery.
        //
        // With 729 million codes over the domain's alphabet, a first collision
        // needs tens of thousands of parcels in lockers at once, and a second in
        // the same store is arithmetic nobody will see. The loop stays because the
        // index is the thing that decides, not the odds.
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
            // Unreachable: every field it validates was produced above. A throw
            // rather than an `Err` because this would be a bug in this service,
            // and because it rolls the claim back instead of committing a locker
            // holding nothing.
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

        // Every attempt collided. Against 729 million codes that means either the
        // generator has stopped being random or the network is holding most of
        // the code space — both are faults, and neither is something the agent
        // can act on.
        throw new Error(
          `could not find an unused pickup code in ${CODE_ATTEMPTS} attempts`
        )
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
