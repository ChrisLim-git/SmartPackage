import type {
  CustomerRepository,
  LockerRepository,
  PackageRepository,
} from "./repository"

/** The repositories a piece of work gets, all bound to the same transaction. */
export type TransactionalRepositories = {
  readonly lockers: LockerRepository
  readonly packages: PackageRepository
  readonly customers: CustomerRepository
}

/**
 * Runs work atomically: all of it commits or none. The callback receives
 * repositories, never a transaction handle.
 */
export interface UnitOfWork {
  run<T>(
    work: (repositories: TransactionalRepositories) => Promise<T>
  ): Promise<T>
}
