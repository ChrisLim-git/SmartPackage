import type { Package } from "@domain/entities/package"

import type { AuditContext } from "./audit-context"

export interface PackageRepository {
  /**
   * The parcel currently in a locker, if there is one.
   *
   * Scoped to `stored` rather than to the locker's whole history: a locker that
   * has held ten packages over a month has one now, and a collection asks about
   * that one.
   */
  findStoredByLockerId(lockerId: string): Promise<Package | null>

  save(parcel: Package, actor: AuditContext): Promise<void>

  findByCustomerId(customerId: string): Promise<Package[]>
}
