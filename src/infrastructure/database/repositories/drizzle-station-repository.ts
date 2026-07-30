import { and, asc, eq } from "drizzle-orm"

import type { StationRepository } from "@domain/interfaces/station-repository"
import { Station } from "@domain/entities/station"
import { isErr } from "@domain/shared/result"

import type { Db, DbOrTx } from "../client"
import { station } from "../schema/station"
import { notDeleted } from "./soft-delete"

type StationRow = typeof station.$inferSelect

/** A row only ever comes from a write this codebase made, so an invalid one is a bug here. */
const toEntity = (row: StationRow): Station => {
  const entity = Station.create({
    id: row.id,
    name: row.name,
    address: row.address,
  })

  if (isErr(entity)) {
    throw new Error(
      `station ${row.id} cannot be read back from the database: ${entity.error.message}`
    )
  }

  return entity.value
}

export class DrizzleStationRepository implements StationRepository {
  constructor(private readonly db: DbOrTx) {}

  async findById(id: string): Promise<Station | null> {
    const [row] = await (this.db as Db)
      .select()
      .from(station)
      .where(and(eq(station.id, id), notDeleted(station)))
      .limit(1)

    return row === undefined ? null : toEntity(row)
  }

  async findAll(): Promise<Station[]> {
    const rows = await (this.db as Db)
      .select()
      .from(station)
      // By name, because this list is read by a person. Insertion order is
      // meaningless to them and changes when the seed does.
      .where(notDeleted(station))
      .orderBy(asc(station.name))

    return rows.map(toEntity)
  }
}
