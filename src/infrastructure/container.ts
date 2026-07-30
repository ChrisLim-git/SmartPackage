import { auth } from "./external/auth/auth"
import { createGuards } from "./external/auth/guard"
import { db } from "./database/client"
import { DrizzleCustomerRepository } from "./database/repositories/drizzle-customer-repository"
import { DrizzleLockerRepository } from "./database/repositories/drizzle-locker-repository"
import { DrizzleLockerSizeRepository } from "./database/repositories/drizzle-locker-size-repository"
import { DrizzlePricingRepository } from "./database/repositories/drizzle-pricing-repository"
import { DrizzleStationRepository } from "./database/repositories/drizzle-station-repository"
import { UuidV7Generator } from "./generators/uuid-v7-generator"

/**
 * Where the interfaces meet their implementations, and the only place that
 * knows both.
 *
 * A route handler asks for `stations`, not for Drizzle. That is the whole point
 * of the inversion, and it stays true only if exactly one module does the
 * wiring — the moment a handler constructs its own repository, the layer
 * boundary is decoration.
 */
export const ids = new UuidV7Generator()

export const stations = new DrizzleStationRepository(db)
export const lockers = new DrizzleLockerRepository(db)
export const lockerSizes = new DrizzleLockerSizeRepository(db)
export const pricing = new DrizzlePricingRepository(db)
export const customers = new DrizzleCustomerRepository(db, ids)

export const guards = createGuards(auth)
