import type { Customer } from "../entities/customer"
import type { Locker } from "../entities/locker"
import type { Package } from "../entities/package"
import type { Station } from "../entities/station"
import type { PricingConfig } from "../utils/pricing-config"
import type { LockerSize, PackageSize } from "../utils/size"

import type { AuditContext } from "./audit-context"

/**
 * What storage looks like from the inside of the domain, in one file.
 *
 * Every repository can be found by id and listed, so that much is generic and
 * written once. What is left below is only what a particular collection does
 * that a generic one cannot — a locker claim that has to be indivisible, an
 * address that resolves to a person, a price table read as a whole.
 *
 * These are declared here rather than taken from `src/infrastructure` for two
 * concrete reasons. A domain service importing a Drizzle-backed class would put
 * a driver inside the layer that is supposed to be independent of it, and every
 * test of that service would then need Postgres — the store and collect flows
 * are exercised in microseconds against in-memory fakes precisely because they
 * depend on these shapes and nothing else.
 *
 * No implementation declares `implements`. The check happens where a repository
 * is handed to a service or to the `UnitOfWork`, which is the only place a
 * mismatch could do harm, and it costs nothing to write.
 */
export interface Repository<TEntity> {
  findById(id: string): Promise<TEntity | null>

  findAll(): Promise<TEntity[]>
}

export type StationRepository = Repository<Station> & {
  /**
   * Brings a station online.
   *
   * No conflict case, unlike a locker's label: there is deliberately no unique
   * index on a station's name, because a name is a label an operator may want
   * to change and a constraint would make renaming one a migration. Two
   * stations may legitimately share a name; the id is the identity.
   */
  create(
    details: { name: string; address: string },
    actor: AuditContext
  ): Promise<Station>
}

/** Read-only: the size ladder is master data, edited by a migration and a seed. */
export type LockerSizeRepository = Pick<Repository<LockerSize>, "findAll">

export type LockerRepository = Repository<Locker> & {
  /**
   * Installs a locker at a station.
   *
   * Identified by size **code**, not by a size row id: a code is a domain fact
   * an administrator can read off a form, and a row id is a database detail
   * that has no business in an application signature.
   *
   * `null` means the label is already in use at that station — an ordinary
   * thing for a person to do twice, not an exceptional one.
   */
  create(
    details: { stationId: string; sizeCode: string; label: string },
    actor: AuditContext
  ): Promise<Locker | null>

  /** Scoped to a station, because a label is only unique where an agent is standing. */
  findByLabel(stationId: string, label: string): Promise<Locker | null>

  findAvailableAtStation(stationId: string): Promise<Locker[]>

  /**
   * Selects the smallest free locker that fits and claims it, as one operation.
   *
   * Deliberately **one** method rather than `findAvailable` then `save`. That
   * split is the read-then-write race: two agents storing at the same station in
   * the same moment both read the same free locker, and both write to it. Making
   * the claim indivisible here means no caller can reintroduce the bug, whatever
   * the implementation does underneath.
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
   * looking at a station needs to see that it is full, not see an empty page.
   */
  findAllWithAvailability(stationId?: string): Promise<Locker[]>
}

export type PackageRepository = {
  /**
   * The parcel a pickup code opens.
   *
   * The recipient types six digits and nothing else — no station, no locker
   * number — so the code has to identify the parcel on its own. Looked up by
   * hash, because the plaintext is never stored; and scoped to `stored`, so a
   * collected parcel's code stops working the moment it is used.
   */
  findStoredByCodeHash(pickupCodeHash: string): Promise<Package | null>

  /**
   * Writes the parcel, and answers whether it was written.
   *
   * `false` means another parcel is already in a locker under that pickup code.
   * That is the caller's problem to solve — by generating a different code — and
   * a boolean says so without the domain learning what a unique index is.
   */
  save(parcel: Package, actor: AuditContext): Promise<boolean>

  findByCustomerId(customerId: string): Promise<Package[]>
}

export type CustomerRepository = Repository<Customer> & {
  findByEmail(email: string): Promise<Customer | null>

  save(customer: Customer, actor: AuditContext): Promise<Customer>

  /**
   * A business operation, not two database calls in a trench coat.
   *
   * An agent standing at a locker types a recipient's address; if that person is
   * not known yet they become known, with no account, no invitation and nothing
   * for the agent to resolve. Expressing it as one method also keeps the race in
   * one place, where a unique index can settle it.
   */
  findOrCreateByEmail(
    details: { email: string; name: string; phone?: string | null },
    actor: AuditContext
  ): Promise<Customer>
}

/**
 * The base rate and its fee table, as one validated object.
 *
 * `PricingConfig.create` refuses a table with a gap, an overlap or no unbounded
 * band, so a repository returning one has already proved the fee table can price
 * any stay. Handing back a loose rate and a loose array of tiers would move that
 * check to whoever remembered to run it.
 */
export type PricingRepository = {
  currentConfig(): Promise<PricingConfig>
}
