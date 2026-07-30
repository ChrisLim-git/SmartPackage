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
 * Runs work so that all of it commits or none of it does.
 *
 * Collecting a package marks the parcel retrieved *and* frees its locker. Half
 * of that is either a locker holding a parcel nobody can collect again, or a
 * locker advertised as free with a parcel still inside it.
 *
 * The callback receives **repositories**, never a transaction handle. Passing
 * the handle would put a Drizzle type in an application signature and every use
 * case would then be written against the database it was supposed to be
 * independent of. This way the transaction exists and stays invisible.
 */
export interface UnitOfWork {
  run<T>(
    work: (repositories: TransactionalRepositories) => Promise<T>
  ): Promise<T>
}
