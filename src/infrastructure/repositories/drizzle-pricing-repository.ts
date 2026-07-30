import { asc } from "drizzle-orm"

import type { PricingRepository } from "@application/interfaces/pricing-repository"
import { isErr } from "@domain/shared/result"
import { FeeTier } from "@domain/value-objects/fee-tier"
import { Money } from "@domain/value-objects/money"
import { PricingConfig } from "@domain/value-objects/pricing-config"

import type { Db, DbOrTx } from "../db/client"
import { feeTier, pricingConfig } from "../db/schema/pricing"
import { notDeleted } from "./soft-delete"

/**
 * The one place a `numeric` string becomes `Money`.
 *
 * Drizzle hands `numeric` back as a string, and that is the whole point — the
 * conversion happens here, through `Money.fromDecimalString`, and never through
 * `parseFloat`. Concentrating it in one method means the money rule holds by
 * construction rather than by everyone remembering it.
 */
export class DrizzlePricingRepository implements PricingRepository {
  constructor(private readonly db: DbOrTx) {}

  async currentConfig(): Promise<PricingConfig> {
    const [config] = await (this.db as Db)
      .select()
      .from(pricingConfig)
      .where(notDeleted(pricingConfig))
      .limit(1)

    if (config === undefined) {
      // Not a `Result`: there is no sensible way for a caller to carry on
      // without a price, and a seeded database always has one. Reaching here
      // means the database was never set up.
      throw new Error("no pricing configuration exists — run pnpm db:seed")
    }

    const baseRate = Money.fromDecimalString(config.baseRatePerDay)
    if (isErr(baseRate)) {
      throw new Error(
        `the base rate "${config.baseRatePerDay}" is not an amount: ${baseRate.error.message}`
      )
    }

    const rows = await (this.db as Db)
      .select()
      .from(feeTier)
      .where(notDeleted(feeTier))
      // Ordered here rather than hoped for: PricingConfig rejects an unsorted
      // table outright, and the unbounded band has to come last.
      .orderBy(asc(feeTier.fromDay))

    const tiers = rows.map((row) => {
      const tier = FeeTier.fromHundredths({
        fromDay: row.fromDay,
        toDay: row.toDay,
        multiplierHundredths: row.multiplierHundredths,
      })

      if (isErr(tier)) {
        throw new Error(
          `fee tier ${row.id} is unreadable: ${tier.error.message}`
        )
      }

      return tier.value
    })

    const built = PricingConfig.create({ baseRate: baseRate.value, tiers })

    if (isErr(built)) {
      // A gap, an overlap or a missing unbounded band. Every one of those is a
      // day that is charged twice or not at all, so it fails here rather than
      // pricing a stay wrongly.
      throw new Error(`the fee table is not usable: ${built.error.message}`)
    }

    return built.value
  }
}
