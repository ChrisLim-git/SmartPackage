import { InstallLockerService } from "@domain/services/install-locker-service"
import { RegisterStationService } from "@domain/services/register-station-service"
import { RetrievePackageService } from "@domain/services/retrieve-package-service"
import { StorePackageService } from "@domain/services/store-package-service"
import { TieredDailyRateFeeService } from "@domain/services/tiered-daily-rate-fee-service"

import { db } from "./database/client"
import { LockerRepository } from "./database/repositories/locker-repository"
import { LockerSizeRepository } from "./database/repositories/locker-size-repository"
import { PricingRepository } from "./database/repositories/pricing-repository"
import { StationRepository } from "./database/repositories/station-repository"
import { UnitOfWork } from "./database/unit-of-work"
import { auth } from "./external/auth/auth"
import { createGuards } from "./external/auth/guard"
import { RandomPickupCodeGenerator } from "@/utils/random-pickup-code-generator"
import { SystemClock } from "@/utils/system-clock"
import { HmacPickupCodeHasher } from "@/utils/pickup-code-hasher"
import { UuidV7Generator } from "@/utils/uuid-v7-generator"

/** Where the interfaces meet their implementations — the only module that wires both. */
export const ids = new UuidV7Generator()
export const clock = new SystemClock()
export const codes = new RandomPickupCodeGenerator()

export const hasher = new HmacPickupCodeHasher()

export const stations = new StationRepository(db)
export const lockers = new LockerRepository(db)
export const lockerSizes = new LockerSizeRepository(db)
export const pricing = new PricingRepository(db)

// The repositories above hold the pool; repositories inside a `run` hold the
// transaction — multi-write flows take the unit of work.
export const uow = new UnitOfWork(db, ids)

// No unit of work: installing a locker is a single insert.
export const installLocker = new InstallLockerService({
  lockers,
  lockerSizes,
  stations,
})

export const registerStation = new RegisterStationService({ stations })

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
