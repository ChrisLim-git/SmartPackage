import { Station } from "../entities/station"
import type { AuditContext } from "../interfaces/audit-context"
import type { StationRepository } from "../interfaces/repository"
import type { MalformedInput } from "../shared/errors"
import { isErr, ok, type Result } from "../shared/result"

export type RegisterStationCommand = {
  readonly name: string
  readonly address: string
  readonly audit: AuditContext
}

export type RegisterStationDependencies = {
  readonly stations: StationRepository
}

/**
 * Bringing a station online.
 *
 * Thin, and honestly so: a station has no behaviour, because every rule that
 * could live on one is really about the lockers inside it. What this service
 * does own is that a half-formed station never reaches the database — the
 * entity's own validation runs first, so an empty name is refused here rather
 * than stored and discovered later by whoever reads the list.
 *
 * There is no conflict case. A name is not an identity — see the repository
 * interface — so unlike a locker's label, registering the same one twice is a
 * thing an operator is allowed to do.
 */
export class RegisterStationService {
  constructor(private readonly dependencies: RegisterStationDependencies) {}

  async register(
    command: RegisterStationCommand
  ): Promise<Result<Station, MalformedInput>> {
    // Validated against the entity before the write, using a placeholder id: the
    // real one is minted by the repository, and the alternative is duplicating
    // `Station`'s rules here where they would drift out of step with it.
    const validated = Station.create({
      id: "pending",
      name: command.name,
      address: command.address,
    })

    if (isErr(validated)) return validated

    // The trimmed values, not the raw ones — a stray space is not part of a name.
    return ok(
      await this.dependencies.stations.create(
        { name: validated.value.name, address: validated.value.address },
        command.audit
      )
    )
  }
}
