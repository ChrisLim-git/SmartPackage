import { asc } from "drizzle-orm"

import { isErr } from "@domain/shared/result"
import { FeeTier } from "@domain/utils/fee-tier"
import { Money } from "@domain/utils/money"
import { PricingConfig } from "@domain/utils/pricing-config"

import { feeTier, pricingConfig } from "../schema/pricing"
import { BaseRepository } from "./base-repository"
import { notDeleted } from "../soft-delete"

/**
 * The one place a `numeric` string becomes `Money` — Drizzle returns `numeric`
 * as a string, converted only via `Money.fromDecimalString`, never `parseFloat`.
 */
export class PricingRepository extends BaseRepository<typeof pricingConfig> {
  protected readonly table = pricingConfig

  async currentConfig(): Promise<PricingConfig> {
    const [config] = await this.query
      .select()
      .from(pricingConfig)
      .where(this.visible)
      .limit(1)

    if (config === undefined) {
      // Not a `Result`: reaching here means the database was never seeded.
      throw new Error("no pricing configuration exists — run pnpm db:seed")
    }

    const baseRate = Money.fromDecimalString(config.baseRatePerDay)
    if (isErr(baseRate)) {
      throw new Error(
        `the base rate "${config.baseRatePerDay}" is not an amount: ${baseRate.error.message}`
      )
    }

    const rows = await this.query
      .select()
      .from(feeTier)
      .where(notDeleted(feeTier))
      // PricingConfig rejects an unsorted table; the unbounded band comes last.
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
      // A gap, overlap or missing unbounded band — fail here rather than
      // price a stay wrongly.
      throw new Error(`the fee table is not usable: ${built.error.message}`)
    }

    return built.value
  }
}
