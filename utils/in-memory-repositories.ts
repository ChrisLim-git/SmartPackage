import type { AuditContext } from "@domain/interfaces/audit-context"
import type {
  CustomerRepository,
  LockerRepository,
  LockerSizeRepository,
  PackageRepository,
  PricingRepository,
  StationRepository,
} from "@domain/interfaces/repository"
import type {
  TransactionalRepositories,
  UnitOfWork,
} from "@domain/interfaces/unit-of-work"
import { Customer } from "@domain/entities/customer"
import { Locker } from "@domain/entities/locker"
import type { Package } from "@domain/entities/package"
import type { Station } from "@domain/entities/station"
import type { IdGenerator } from "@domain/interfaces/id-generator"
import { OrdinalFitService } from "@domain/services/ordinal-fit-service"
import { SmallestFitFirstService } from "@domain/services/smallest-fit-first-service"
import { isErr } from "@domain/shared/result"
import type { PricingConfig } from "@domain/utils/pricing-config"
import type { LockerSize, PackageSize } from "@domain/utils/size"

/**
 * In-memory repositories, for domain-service tests that have no business
 * touching a database.
 *
 * These are not mocks. Each holds real state and answers real queries, so a
 * service exercised against one is exercised properly — it just runs in
 * microseconds. What they cannot prove is anything about SQL, which is why the
 * Postgres implementations are tested separately, and only where they do
 * something a generic repository would not.
 *
 * They have no importer until T401. That is deliberate: the fakes and the
 * repository interfaces were written together in T303, so the contract had a
 * second implementation to answer to before the first one shipped.
 */

export class InMemoryStationRepository implements StationRepository {
  constructor(private readonly stations: Station[] = []) {}

  async findById(id: string): Promise<Station | null> {
    return this.stations.find((station) => station.id === id) ?? null
  }

  async findAll(): Promise<Station[]> {
    return [...this.stations]
  }
}

export class InMemoryLockerRepository implements LockerRepository {
  /**
   * The **real** selection policy, not a second implementation of "smallest
   * fitting".
   *
   * If this fake picked lockers its own way, it and the SQL could disagree
   * about which locker a package belongs in while both test suites stayed
   * green — and the fast tests would be confirming a rule the system does not
   * follow.
   */
  private readonly selection = new SmallestFitFirstService(
    new OrdinalFitService()
  )

  constructor(
    private lockers: Locker[] = [],
    private readonly sizes: LockerSize[] = []
  ) {}

  async create(
    details: { stationId: string; sizeCode: string; label: string },
    _actor: AuditContext
  ): Promise<Locker | null> {
    const taken = await this.findByLabel(details.stationId, details.label)
    if (taken !== null) {
      return null
    }

    const size = this.sizes.find(({ code }) => code === details.sizeCode)
    if (size === undefined) {
      throw new Error(`no locker size is coded "${details.sizeCode}"`)
    }

    const created = Locker.create({
      id: `locker-${this.lockers.length + 1}`,
      stationId: details.stationId,
      size,
      label: details.label,
    })

    if (isErr(created)) {
      throw new Error(`cannot create a locker: ${created.error.message}`)
    }

    this.lockers.push(created.value)

    return created.value
  }

  private replace(updated: Locker): void {
    this.lockers = this.lockers.map((locker) =>
      locker.id === updated.id ? updated : locker
    )
  }

  async findById(id: string): Promise<Locker | null> {
    return this.lockers.find((locker) => locker.id === id) ?? null
  }

  async findAll(): Promise<Locker[]> {
    return this.findAllWithAvailability()
  }

  async findByLabel(stationId: string, label: string): Promise<Locker | null> {
    return (
      this.lockers.find(
        (locker) => locker.stationId === stationId && locker.label === label
      ) ?? null
    )
  }

  async findAvailableAtStation(stationId: string): Promise<Locker[]> {
    return this.lockers.filter(
      (locker) => locker.stationId === stationId && locker.isAvailable()
    )
  }

  async claimSmallestFitting(
    stationId: string,
    size: PackageSize
  ): Promise<Locker | null> {
    const chosen = this.selection.select(
      await this.findAvailableAtStation(stationId),
      size
    )

    if (isErr(chosen)) {
      return null
    }

    // Single-threaded, so the claim is atomic here for free. The database
    // implementation has to earn the same guarantee with a row lock.
    const occupied = chosen.value.occupy("claimed")
    if (isErr(occupied)) {
      return null
    }

    this.replace(occupied.value)

    return occupied.value
  }

  async release(lockerId: string): Promise<void> {
    const locker = await this.findById(lockerId)
    if (locker === null) return

    const released = locker.release()
    if (isErr(released)) return

    this.replace(released.value)
  }

  async findAllWithAvailability(stationId?: string): Promise<Locker[]> {
    return stationId === undefined
      ? [...this.lockers]
      : this.lockers.filter((locker) => locker.stationId === stationId)
  }
}

export class InMemoryPackageRepository implements PackageRepository {
  constructor(private parcels: Package[] = []) {}

  async findStoredByLockerId(lockerId: string): Promise<Package | null> {
    return (
      this.parcels.find(
        (parcel) => parcel.lockerId === lockerId && parcel.status === "stored"
      ) ?? null
    )
  }

  async findStoredByCodeHash(pickupCodeHash: string): Promise<Package | null> {
    return (
      this.parcels.find(
        (parcel) =>
          parcel.pickupCodeHash === pickupCodeHash && parcel.status === "stored"
      ) ?? null
    )
  }

  async save(parcel: Package): Promise<boolean> {
    const existing = this.parcels.findIndex((held) => held.id === parcel.id)

    if (existing !== -1) {
      this.parcels[existing] = parcel
      return true
    }

    // The same rule the partial unique index enforces in Postgres, so the retry
    // in `StorePackageService` is exercised here rather than only in production.
    if ((await this.findStoredByCodeHash(parcel.pickupCodeHash)) !== null) {
      return false
    }

    this.parcels.push(parcel)

    return true
  }

  async findByCustomerId(customerId: string): Promise<Package[]> {
    return this.parcels.filter((parcel) => parcel.customerId === customerId)
  }
}

export class InMemoryCustomerRepository implements CustomerRepository {
  constructor(
    private readonly ids: IdGenerator,
    private customers: Customer[] = []
  ) {}

  async findById(id: string): Promise<Customer | null> {
    return this.customers.find((customer) => customer.id === id) ?? null
  }

  async findAll(): Promise<Customer[]> {
    return [...this.customers]
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const folded = email.trim().toLowerCase()

    return this.customers.find((customer) => customer.email === folded) ?? null
  }

  async save(customer: Customer, _actor: AuditContext): Promise<Customer> {
    const existing = this.customers.findIndex((held) => held.id === customer.id)

    if (existing === -1) {
      this.customers.push(customer)
    } else {
      this.customers[existing] = customer
    }

    return customer
  }

  async findOrCreateByEmail(
    details: {
      email: string
      name: string
      phone?: string | null
    },
    actor: AuditContext
  ): Promise<Customer> {
    const existing = await this.findByEmail(details.email)
    if (existing !== null) {
      return existing
    }

    const created = Customer.create({
      id: this.ids.next(),
      name: details.name,
      email: details.email,
      phone: details.phone ?? null,
      userId: null,
    })

    if (isErr(created)) {
      throw new Error(`cannot create a customer: ${created.error.message}`)
    }

    return this.save(created.value, actor)
  }
}

export class InMemoryPricingRepository implements PricingRepository {
  constructor(private readonly config: PricingConfig) {}

  async currentConfig(): Promise<PricingConfig> {
    return this.config
  }
}

/**
 * Runs the work and hands back what it returns.
 *
 * There is no rollback here, and pretending otherwise would be worse than not
 * having one: a fake that silently undid writes would let a service depend on
 * atomicity this cannot provide, and the first real failure would happen in
 * Postgres. Whether the transaction actually holds is proven against the
 * database, not here.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private readonly repositories: TransactionalRepositories) {}

  async run<T>(
    work: (repositories: TransactionalRepositories) => Promise<T>
  ): Promise<T> {
    return work(this.repositories)
  }
}

export class InMemoryLockerSizeRepository implements LockerSizeRepository {
  constructor(private readonly sizes: readonly LockerSize[]) {}

  async findAll(): Promise<LockerSize[]> {
    // Rank order, because the selection rule reads the ladder in order and a
    // fake that returned insertion order would let a bug in that ordering pass.
    return [...this.sizes].sort((a, b) => a.rank - b.rank)
  }
}
