import { auth } from "./external/auth/auth"
import { createGuards } from "./external/auth/guard"
import { db } from "./database/client"
import { CustomerRepository } from "./database/repositories/customer-repository"
import { LockerRepository } from "./database/repositories/locker-repository"
import { LockerSizeRepository } from "./database/repositories/locker-size-repository"
import { PricingRepository } from "./database/repositories/pricing-repository"
import { StationRepository } from "./database/repositories/station-repository"
import { UuidV7Generator } from "./generators/uuid-v7-generator"

/**
 * Where the interfaces meet their implementations, and the only place that
 * knows both.
 *
 * A route handler asks for `stations`, not for a database. That is the whole point
 * of the inversion, and it stays true only if exactly one module does the
 * wiring — the moment a handler constructs its own repository, the layer
 * boundary is decoration.
 */
export const ids = new UuidV7Generator()

export const stations = new StationRepository(db)
export const lockers = new LockerRepository(db)
export const lockerSizes = new LockerSizeRepository(db)
export const pricing = new PricingRepository(db)
export const customers = new CustomerRepository(db, ids)

export const guards = createGuards(auth)
