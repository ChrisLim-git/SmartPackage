import type { Locker } from "@domain/entities/locker"
import type { PackageSize } from "@domain/value-objects/size"

import type { AuditContext } from "./audit-context"

export interface LockerRepository {
  findById(id: string): Promise<Locker | null>

  /** Scoped to a station, because a label is only unique where an agent is standing. */
  findByLabel(stationId: string, label: string): Promise<Locker | null>

  findAvailableAtStation(stationId: string): Promise<Locker[]>

  /**
   * Selects the smallest free locker that fits and claims it, as one operation.
   *
   * Deliberately **one** method rather than `findAvailable` then `save`. That
   * split is the read-then-write race: two agents storing at the same station
   * in the same moment both read the same free locker, and both write to it.
   * Making the claim indivisible in the interface means no caller can
   * reintroduce the bug, whatever the implementation does underneath.
   *
   * `null` means nothing suitable was free — an ordinary outcome under
   * contention, not a failure.
   */
  claimSmallestFitting(
    stationId: string,
    size: PackageSize,
    actor: AuditContext
  ): Promise<Locker | null>

  release(lockerId: string, actor: AuditContext): Promise<void>

  /**
   * Every locker with its current status — L1's availability listing.
   *
   * Occupied lockers included, unlike `findAvailableAtStation`: an operator
   * looking at a station needs to see it is full, not see an empty page.
   */
  findAllWithAvailability(stationId?: string): Promise<Locker[]>
}
