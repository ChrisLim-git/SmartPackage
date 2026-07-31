import { asc, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

import { LockerSize } from "@domain/utils/size"

import { lockerSize } from "../schema/locker-size"
import { EntityRepository } from "./base-repository"

type LockerSizeRow = typeof lockerSize.$inferSelect

export class LockerSizeRepository extends EntityRepository<
  LockerSize,
  typeof lockerSize
> {
  protected readonly table = lockerSize

  protected toEntity(row: LockerSizeRow): LockerSize {
    return this.rebuilt(
      LockerSize.create({ code: row.code, rank: row.rank, label: row.label }),
      row.id
    )
  }

  /** By rank — alphabetical would put L before M and S. */
  protected override order(): (SQL | PgColumn)[] {
    return [asc(lockerSize.rank)]
  }
}
