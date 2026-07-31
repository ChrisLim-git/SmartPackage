import { AsyncLocalStorage } from "node:async_hooks"

import type { IdGenerator } from "@domain/interfaces/id-generator"
import type { TransactionalRepositories } from "@domain/interfaces/unit-of-work"

import type { Db, DbOrTx } from "./client"
import { CustomerRepository } from "./repositories/customer-repository"
import { LockerRepository } from "./repositories/locker-repository"
import { PackageRepository } from "./repositories/package-repository"

// Per async context, not per instance: an instance flag on the shared
// `UnitOfWork` would make two concurrent requests look like a nested call.
const inTransaction = new AsyncLocalStorage<true>()

/**
 * One transaction, and the repositories bound to it — a repository holding the
 * pool instead would read around the transaction. The callback never receives
 * the handle itself: that would put a Drizzle type in a domain signature.
 */
export class UnitOfWork {
  constructor(
    private readonly db: Db,
    private readonly ids: IdGenerator
  ) {}

  async run<T>(
    work: (repositories: TransactionalRepositories) => Promise<T>
  ): Promise<T> {
    if (inTransaction.getStore() === true) {
      // A nested call would take a second connection: blind to this
      // transaction's writes and able to deadlock on its rows.
      throw new Error("a unit of work cannot nest inside another")
    }

    return this.db.transaction((tx) =>
      inTransaction.run(true, () => work(this.repositoriesOn(tx)))
    )
  }

  private repositoriesOn(tx: DbOrTx): TransactionalRepositories {
    return {
      lockers: new LockerRepository(tx),
      packages: new PackageRepository(tx),
      customers: new CustomerRepository(tx, this.ids),
    }
  }
}
