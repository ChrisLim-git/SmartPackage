import { RetrievePackageService } from "@domain/services/retrieve-package-service"
import { StorePackageService } from "@domain/services/store-package-service"
import { TieredDailyRateFeeService } from "@domain/services/tiered-daily-rate-fee-service"

import { db } from "./database/client"
import { CustomerRepository } from "./database/repositories/customer-repository"
import { LockerRepository } from "./database/repositories/locker-repository"
import { LockerSizeRepository } from "./database/repositories/locker-size-repository"
import { PackageRepository } from "./database/repositories/package-repository"
import { PricingRepository } from "./database/repositories/pricing-repository"
import { StationRepository } from "./database/repositories/station-repository"
import { UnitOfWork } from "./database/unit-of-work"
import { auth } from "./external/auth/auth"
import { createGuards } from "./external/auth/guard"
import { RandomPickupCodeGenerator } from "./generators/random-pickup-code-generator"
import { UuidV7Generator } from "./generators/uuid-v7-generator"
import { HmacPickupCodeHasher } from "./security/pickup-code-hasher"
import { SystemClock } from "./time/system-clock"

/**
 * Where the interfaces meet their implementations, and the only place that knows
 * both.
 *
 * A route handler asks for `storePackage`, not for a database. That is the whole
 * point of the inversion, and it stays true only if exactly one module does the
 * wiring — the moment a handler constructs its own repository, the layer boundary
 * is decoration.
 */
export const ids = new UuidV7Generator()
export const clock = new SystemClock()
export const codes = new RandomPickupCodeGenerator()

export const hasher = new HmacPickupCodeHasher()

export const stations = new StationRepository(db)
export const lockers = new LockerRepository(db)
export const lockerSizes = new LockerSizeRepository(db)
export const pricing = new PricingRepository(db)
export const customers = new CustomerRepository(db, ids)
export const packages = new PackageRepository(db)

/**
 * The repositories above hold the pool; the ones inside a `run` hold the
 * transaction. A flow that writes more than one row takes the second kind, which
 * is why the services below are given the unit of work and not these.
 */
export const uow = new UnitOfWork(db, ids)

export const storePackage = new StorePackageService({
  stations,
  lockerSizes,
  codes,
  hasher,
  ids,
  clock,
  uow,
})

export const collectPackage = new RetrievePackageService({
  pricing,
  fees: new TieredDailyRateFeeService(),
  hasher,
  clock,
  uow,
})

export const guards = createGuards(auth)
