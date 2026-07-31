import type { Locker } from "../entities/locker"
import type { AuditContext } from "../interfaces/audit-context"
import type {
  LockerRepository,
  LockerSizeRepository,
  StationRepository,
} from "../interfaces/repository"
import {
  type LockerLabelTaken,
  lockerLabelTaken,
  type MalformedInput,
  type StationNotFound,
  stationNotFound,
} from "../shared/errors"
import { err, isErr, ok, type Result } from "../shared/result"
import { findSizeByCode } from "../utils/size"

export type InstallLockerCommand = {
  readonly stationId: string
  /** The size code an administrator picked; resolving it to a size is the domain's lookup. */
  readonly sizeCode: string
  readonly label: string
  readonly audit: AuditContext
}

export type InstallLockerDependencies = {
  readonly lockers: LockerRepository
  readonly lockerSizes: LockerSizeRepository
  readonly stations: StationRepository
}

export type InstallLockerFailure =
  MalformedInput | StationNotFound | LockerLabelTaken

/**
 * Installs a locker at a station. Check order matters and is asserted by a
 * test: caller-fixable input is refused before conflicts are reported.
 */
export class InstallLockerService {
  constructor(private readonly dependencies: InstallLockerDependencies) {}

  async install(
    command: InstallLockerCommand
  ): Promise<Result<Locker, InstallLockerFailure>> {
    const { lockers, lockerSizes, stations } = this.dependencies

    // Checked here: the repository could only report an unknown size by throwing.
    const size = findSizeByCode(
      await lockerSizes.findAll(),
      command.sizeCode,
      "sizeCode"
    )
    if (isErr(size)) return size

    // Checked before the insert reaches the foreign key.
    if ((await stations.findById(command.stationId)) === null) {
      return err(stationNotFound(command.stationId))
    }

    const created = await lockers.create(
      {
        stationId: command.stationId,
        sizeCode: command.sizeCode,
        label: command.label,
      },
      command.audit
    )

    if (created === null) {
      // Repository returns `null` for a taken label; naming the conflict is this service's job.
      return err(lockerLabelTaken(command.stationId, command.label))
    }

    return ok(created)
  }
}
