import { AsyncLocalStorage } from "node:async_hooks"

import type { IdGenerator } from "@domain/interfaces/id-generator"
import type { TransactionalRepositories } from "@domain/interfaces/unit-of-work"

import type { Db, DbOrTx } from "./client"
import { CustomerRepository } from "./repositories/customer-repository"
import { LockerRepository } from "./repositories/locker-repository"
import { PackageRepository } from "./repositories/package-repository"

/**
 * Whether the current async context is already inside a `run`.
 *
 * Per async context rather than per instance: the container exports one
 * `UnitOfWork` for the process, so an instance flag would make two concurrent
 * requests look like a nested call and fail the second one.
 */
const inTransaction = new AsyncLocalStorage<true>()

/**
 * One transaction, and the repositories bound to it.
 *
 * Every repository handed to the callback is constructed over the transaction
 * handle rather than the pool, which is the whole point: a repository holding the
 * pool would read around the transaction and answer with committed state, so a
 * service would decide on what it had already changed and not seen.
 *
 * The callback never receives the handle itself. Passing it would put a Drizzle
 * type in a domain signature, and the flows would then be written against the
 * database they are defined by not knowing.
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
      // A nested call would check out a second connection and open an unrelated
      // transaction on it: blind to this one's uncommitted writes, and blocking
      // on any row it holds — a deadlock that looks like a slow request. Drizzle
      // can make a savepoint from a transaction handle, but this class only ever
      // holds the pool, so there is nothing honest to nest on. No flow here
      // nests; the day one needs to, it needs a savepoint written on purpose.
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
