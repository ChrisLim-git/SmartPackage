import {
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import type { LockerStatus } from "@domain/entities/locker"

import { auditColumns, primaryId } from "./columns"
import { lockerSize } from "./locker-size"
import { station } from "./station"

/**
 * `satisfies` ties these to the domain union, so a status the domain does not
 * know cannot reach the database definition.
 */
const LOCKER_STATUSES = [
  "available",
  "occupied",
] as const satisfies readonly LockerStatus[]

export const lockerStatus = pgEnum("locker_status", LOCKER_STATUSES)

/**
 * A single locker at a station.
 *
 * Status is a Postgres enum rather than text, because this column is the
 * concurrency invariant: `T501` claims a locker by moving it from `available`
 * to `occupied` under a row lock, and a typo'd `"Available"` would be a locker
 * that silently never gets used.
 *
 * Neither foreign key cascades. Deleting a station out from under a locker
 * holding somebody's parcel should fail loudly; soft deletion is the delete
 * story here, and it leaves the row where it is.
 */
export const locker = pgTable(
  "locker",
  {
    id: primaryId(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => station.id),
    sizeId: uuid("size_id")
      .notNull()
      .references(() => lockerSize.id),
    label: text("label").notNull(),
    status: lockerStatus("status").notNull().default("available"),
    ...auditColumns,
  },
  (table) => [
    // Labels are how an agent tells two lockers apart, so they must be unique
    // where an agent is standing — within a station, not across the network.
    uniqueIndex("locker_station_label_unique").on(table.stationId, table.label),
    // The hot path for the atomic claim: find an available locker at this
    // station. Without it that query is a sequential scan under a lock.
    index("locker_station_status_idx").on(table.stationId, table.status),
  ]
)
