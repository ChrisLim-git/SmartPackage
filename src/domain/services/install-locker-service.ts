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
  /**
   * The size **code** an administrator picked, not a value object. Turning a
   * code into a size is a lookup against master data, which the domain can do
   * and a route handler has no business doing.
   */
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
 * Bringing a locker online at a station.
 *
 * Three ways this can fail, and all three are ordinary — a mistyped size code,
 * a station that is not there, a door number already in use. None is an
 * exception, so each comes back as a `Result` carrying which one it was, and
 * the route handler above only has to map a code to a status.
 *
 * The order of the checks is deliberate and is asserted by a test. Input the
 * caller can fix is refused first: reporting a mistyped size as a label
 * conflict would send an administrator looking at the wrong thing.
 */
export class InstallLockerService {
  constructor(private readonly dependencies: InstallLockerDependencies) {}

  async install(
    command: InstallLockerCommand
  ): Promise<Result<Locker, InstallLockerFailure>> {
    const { lockers, lockerSizes, stations } = this.dependencies

    // Checked here rather than left to the insert. The repository can only
    // report an unknown size by throwing, and a throw in this codebase means a
    // bug or an infrastructure failure — not a typo in a form.
    const size = findSizeByCode(
      await lockerSizes.findAll(),
      command.sizeCode,
      "sizeCode"
    )
    if (isErr(size)) return size

    // Same reasoning one table over: without this the insert reaches a foreign
    // key, and the caller is told the server broke when what happened is that
    // they named a station that does not exist.
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
      // The repository says `null` for a taken label because at its level that
      // is all there is to say. Naming it is this service's job: the reason
      // has to survive the trip to the caller, and `null` does not carry one.
      return err(lockerLabelTaken(command.stationId, command.label))
    }

    return ok(created)
  }
}
