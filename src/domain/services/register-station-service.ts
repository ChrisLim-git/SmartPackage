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
 * Registers a station. No conflict case: a name is not an identity, so the
 * same name may be registered twice.
 */
export class RegisterStationService {
  constructor(private readonly dependencies: RegisterStationDependencies) {}

  async register(
    command: RegisterStationCommand
  ): Promise<Result<Station, MalformedInput>> {
    // Validated via the entity with a placeholder id; the real id is minted by the repository.
    const validated = Station.create({
      id: "pending",
      name: command.name,
      address: command.address,
    })

    if (isErr(validated)) return validated

    // Persist the trimmed values, not the raw input.
    return ok(
      await this.dependencies.stations.create(
        { name: validated.value.name, address: validated.value.address },
        command.audit
      )
    )
  }
}
