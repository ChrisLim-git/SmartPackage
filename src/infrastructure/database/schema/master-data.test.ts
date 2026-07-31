import { createTestDb } from "@/utils/test-db"
import { eq, sql } from "drizzle-orm"

import { locker } from "./locker"
import { lockerSize } from "./locker-size"
import { pricingConfig } from "./pricing"
import { station } from "./station"

const { pool, db } = createTestDb()

// Every table the domain owns. BetterAuth's four are held to the key
// convention only, asserted separately.
const DOMAIN_TABLES = [
  "customer",
  "station",
  "locker_size",
  "locker",
  "pricing_config",
  "fee_tier",
  "package",
]

const AUDIT_COLUMNS = [
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
]

const columnsOf = async (table: string) => {
  const { rows } = await pool.query<{
    column_name: string
    data_type: string
    udt_name: string
    column_default: string | null
    numeric_precision: number | null
    numeric_scale: number | null
  }>(
    `SELECT column_name, data_type, udt_name,
            column_default, numeric_precision, numeric_scale
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )

  return rows
}

const primaryKeyOf = async (table: string) => {
  const { rows } = await pool.query<{ attname: string }>(
    `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    [table]
  )

  return rows.map((row) => row.attname)
}

describe("the master data schema", () => {
  afterAll(async () => {
    await pool.query("DELETE FROM locker")
    await pool.query("DELETE FROM station")
    await pool.query("DELETE FROM locker_size")
    await pool.query("DELETE FROM pricing_config")
    await pool.end()
  })

  describe("conventions", () => {
    it.each(DOMAIN_TABLES)("gives %s a uuidv7 primary key", async (table) => {
      const id = (await columnsOf(table)).find((c) => c.column_name === "id")

      expect(id?.data_type).toBe("uuid")
      // The `uuidv7()` default is what makes the key time-sortable — assert
      // it, not just the type.
      expect(id?.column_default).toBe("uuidv7()")
      expect(await primaryKeyOf(table)).toEqual(["id"])
    })

    it.each(["user", "session", "account", "verification"])(
      "gives BetterAuth's %s table a uuidv7 key too",
      async (table) => {
        const id = (await columnsOf(table)).find((c) => c.column_name === "id")

        // A seed or migration inserting here gets the column default — a v4
        // beside v7s is the convention quietly broken.
        expect(id?.data_type).toBe("uuid")
        expect(id?.column_default).toBe("uuidv7()")
      }
    )

    it.each(DOMAIN_TABLES)("gives %s all five audit columns", async (table) => {
      const present = (await columnsOf(table)).map((c) => c.column_name)

      expect(AUDIT_COLUMNS.filter((c) => present.includes(c))).toEqual(
        AUDIT_COLUMNS
      )
    })

    it("leaves BetterAuth's tables alone", async () => {
      const present = (await columnsOf("user")).map((c) => c.column_name)

      // No audit columns, no soft delete — an account is not a domain table.
      expect(present).not.toContain("deleted_at")
      expect(present).not.toContain("created_by")
    })

    it("types money as numeric, never as a float", async () => {
      const rate = (await columnsOf("pricing_config")).find(
        (c) => c.column_name === "base_rate_per_day"
      )
      const fee = (await columnsOf("package")).find(
        (c) => c.column_name === "fee_charged"
      )

      expect(rate?.data_type).toBe("numeric")
      expect(fee?.data_type).toBe("numeric")
    })

    it.each(DOMAIN_TABLES)(
      "gives every numeric column on %s the same precision and scale",
      async (table) => {
        // Two money columns of different scale round differently — assert the
        // width, not merely the type.
        const money = (await columnsOf(table)).filter(
          (c) => c.data_type === "numeric"
        )

        for (const column of money) {
          expect({
            column: column.column_name,
            precision: column.numeric_precision,
            scale: column.numeric_scale,
          }).toEqual({
            column: column.column_name,
            precision: 12,
            scale: 2,
          })
        }
      }
    )

    it.each(DOMAIN_TABLES)(
      "times every timestamp on %s with a time zone",
      async (table) => {
        const times = (await columnsOf(table)).filter((c) =>
          c.data_type.startsWith("timestamp")
        )

        // A naive timestamp anywhere makes day arithmetic depend on server locale.
        expect(times.length).toBeGreaterThan(0)
        expect(
          times.filter((c) => c.data_type !== "timestamp with time zone")
        ).toEqual([])
      }
    )

    it("makes both status columns real enums, not free text", async () => {
      const lockerStatusColumn = (await columnsOf("locker")).find(
        (c) => c.column_name === "status"
      )
      const packageStatusColumn = (await columnsOf("package")).find(
        (c) => c.column_name === "status"
      )

      expect(lockerStatusColumn?.udt_name).toBe("locker_status")
      expect(packageStatusColumn?.udt_name).toBe("package_status")
    })
  })

  describe("against real rows", () => {
    it("round-trips a decimal exactly, and hands it back as a string", async () => {
      const [created] = await db
        .insert(pricingConfig)
        .values({ baseRatePerDay: "10.05", currencyCode: "AUD" })
        .returning()

      const [raised] = await db
        .update(pricingConfig)
        .set({ baseRatePerDay: sql`${pricingConfig.baseRatePerDay} + 0.10` })
        .where(eq(pricingConfig.id, created.id))
        .returning()

      // A string, not a number — `mode: "number"` would float it.
      expect(typeof raised.baseRatePerDay).toBe("string")
      expect(raised.baseRatePerDay).toBe("10.15")
    })

    it("refuses a status the enum does not define", async () => {
      const [size] = await db
        .insert(lockerSize)
        .values({ code: "S", rank: 1, label: "Small" })
        .returning()
      const [where] = await db
        .insert(station)
        .values({ name: "Central", address: "1 Station Road" })
        .returning()

      await expect(
        pool.query(
          `INSERT INTO locker (station_id, size_id, label, status)
           VALUES ($1, $2, 'A1', 'Available')`,
          [where.id, size.id]
        )
      ).rejects.toThrow(/invalid input value for enum/)
    })

    it("rejects two lockers sharing a label at one station, but not across two", async () => {
      const [size] = await db
        .insert(lockerSize)
        .values({ code: "M", rank: 2, label: "Medium" })
        .returning()
      const [central] = await db
        .insert(station)
        .values({ name: "Central", address: "1 Station Road" })
        .returning()
      const [harbour] = await db
        .insert(station)
        .values({ name: "Harbour", address: "2 Dock Street" })
        .returning()

      await db
        .insert(locker)
        .values({ stationId: central.id, sizeId: size.id, label: "A1" })

      // Drizzle names the constraint on `error.cause`; the message is the failed query.
      await expect(
        db
          .insert(locker)
          .values({ stationId: central.id, sizeId: size.id, label: "A1" })
      ).rejects.toMatchObject({
        cause: { constraint: "locker_station_label_unique" },
      })

      // The same label at another station is a different locker.
      const [elsewhere] = await db
        .insert(locker)
        .values({ stationId: harbour.id, sizeId: size.id, label: "A1" })
        .returning()

      expect(elsewhere.label).toBe("A1")
    })

    it("starts a locker available", async () => {
      const [size] = await db
        .insert(lockerSize)
        .values({ code: "L", rank: 3, label: "Large" })
        .returning()
      const [where] = await db
        .insert(station)
        .values({ name: "Airport", address: "3 Terminal Way" })
        .returning()

      const [created] = await db
        .insert(locker)
        .values({ stationId: where.id, sizeId: size.id, label: "B1" })
        .returning()

      expect(created.status).toBe("available")
    })
  })
})
