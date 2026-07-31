import type { Customer } from "../entities/customer"
import type { Locker } from "../entities/locker"
import type { Package } from "../entities/package"
import type { Station } from "../entities/station"
import type { PricingConfig } from "../utils/pricing-config"
import type { LockerSize, PackageSize } from "../utils/size"

import type { AuditContext } from "./audit-context"

/**
 * Storage as the domain sees it. Declared here, not imported from
 * infrastructure, so domain services and their tests depend on shapes only.
 */
export interface Repository<TEntity> {
  findById(id: string): Promise<TEntity | null>

  findAll(): Promise<TEntity[]>
}

export type StationRepository = Repository<Station> & {
  /** No unique index on name: two stations may share one; the id is the identity. */
  create(
    details: { name: string; address: string },
    actor: AuditContext
  ): Promise<Station>
}

/** Read-only: the size ladder is master data, edited by a migration and a seed. */
export type LockerSizeRepository = Pick<Repository<LockerSize>, "findAll">

export type LockerRepository = Repository<Locker> & {
  /**
   * Installs a locker; identified by size code, not row id. `null` means the
   * label is already in use at that station.
   */
  create(
    details: { stationId: string; sizeCode: string; label: string },
    actor: AuditContext
  ): Promise<Locker | null>

  /** Scoped to a station, because a label is only unique where an agent is standing. */
  findByLabel(stationId: string, label: string): Promise<Locker | null>

  findAvailableAtStation(stationId: string): Promise<Locker[]>

  /**
   * Finds and claims the smallest free fitting locker as one indivisible operation —
   * a find-then-save split reintroduces the read-then-write race. `null`: nothing free.
   */
  claimSmallestFitting(
    stationId: string,
    size: PackageSize,
    actor: AuditContext
  ): Promise<Locker | null>

  release(lockerId: string, actor: AuditContext): Promise<void>

  /** Every locker with its current status, occupied ones included. */
  findAllWithAvailability(stationId?: string): Promise<Locker[]>
}

export type PackageRepository = {
  /**
   * The stored parcel for a code hash (plaintext is never stored); spent codes read
   * as `null`. Inside a unit of work the row is held, so concurrent lookups serialize.
   */
  findStoredByCodeHash(pickupCodeHash: string): Promise<Package | null>

  /**
   * Writes the parcel; `false` means the write lost — the code hash is already
   * live (first write) or the parcel was no longer `stored` (collection).
   */
  save(parcel: Package, actor: AuditContext): Promise<boolean>
}

export type CustomerRepository = Repository<Customer> & {
  /** One operation, so the find/create race is settled in one place by a unique index. */
  findOrCreateByEmail(
    details: { email: string; name: string; phone?: string | null },
    actor: AuditContext
  ): Promise<Customer>
}

/**
 * The base rate and fee table as one validated `PricingConfig`, already proven
 * able to price any stay.
 */
export type PricingRepository = {
  currentConfig(): Promise<PricingConfig>
}
