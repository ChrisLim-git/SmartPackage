import { asc, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

import { Station } from "@domain/entities/station"

import { station } from "../schema/station"
import { EntityRepository } from "./base-repository"

type StationRow = typeof station.$inferSelect

export class StationRepository extends EntityRepository<
  Station,
  typeof station
> {
  protected readonly table = station

  protected toEntity(row: StationRow): Station {
    return this.rebuilt(
      Station.create({ id: row.id, name: row.name, address: row.address }),
      row.id
    )
  }

  /**
   * By name, because this list is read by a person. Insertion order is
   * meaningless to them and changes when the seed does.
   */
  protected override order(): (SQL | PgColumn)[] {
    return [asc(station.name)]
  }
}
