import { auth } from "./external/auth/auth"
import { createGuards } from "./external/auth/guard"
import { db } from "./database/client"
import { PostgresCustomerRepository } from "./database/repositories/postgres-customer-repository"
import { PostgresLockerRepository } from "./database/repositories/postgres-locker-repository"
import { PostgresLockerSizeRepository } from "./database/repositories/postgres-locker-size-repository"
import { PostgresPricingRepository } from "./database/repositories/postgres-pricing-repository"
import { PostgresStationRepository } from "./database/repositories/postgres-station-repository"
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

export const stations = new PostgresStationRepository(db)
export const lockers = new PostgresLockerRepository(db)
export const lockerSizes = new PostgresLockerSizeRepository(db)
export const pricing = new PostgresPricingRepository(db)
export const customers = new PostgresCustomerRepository(db, ids)

export const guards = createGuards(auth)
