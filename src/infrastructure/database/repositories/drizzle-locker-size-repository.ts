import { asc } from "drizzle-orm"

import type { LockerSizeRepository } from "@application/interfaces/locker-size-repository"
import { isErr } from "@domain/shared/result"
import { LockerSize } from "@domain/utils/size"

import type { Db, DbOrTx } from "../client"
import { lockerSize } from "../schema/locker-size"
import { notDeleted } from "./soft-delete"

export class DrizzleLockerSizeRepository implements LockerSizeRepository {
  constructor(private readonly db: DbOrTx) {}

  async findAll(): Promise<LockerSize[]> {
    const rows = await (this.db as Db)
      .select()
      .from(lockerSize)
      .where(notDeleted(lockerSize))
      // By rank, which is the ladder itself — alphabetical would put L before
      // M and S, and a size picker would read as nonsense.
      .orderBy(asc(lockerSize.rank))

    return rows.map((row) => {
      const size = LockerSize.create({
        code: row.code,
        rank: row.rank,
        label: row.label,
      })

      if (isErr(size)) {
        throw new Error(
          `locker size ${row.id} is unreadable: ${size.error.message}`
        )
      }

      return size.value
    })
  }
}
