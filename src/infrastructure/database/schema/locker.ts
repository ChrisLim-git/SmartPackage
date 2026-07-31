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

/** `satisfies` ties these to the domain union. */
const LOCKER_STATUSES = [
  "available",
  "occupied",
] as const satisfies readonly LockerStatus[]

export const lockerStatus = pgEnum("locker_status", LOCKER_STATUSES)

/**
 * A single locker at a station. Status is a real enum because the column is
 * the concurrency invariant — a typo'd status would be a locker that never gets
 * used. Neither foreign key cascades: soft deletion is the delete story here.
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
    // Labels are unique within a station, not across the network.
    uniqueIndex("locker_station_label_unique").on(table.stationId, table.label),
    // Hot path for the atomic claim — otherwise a sequential scan under a lock.
    index("locker_station_status_idx").on(table.stationId, table.status),
  ]
)
