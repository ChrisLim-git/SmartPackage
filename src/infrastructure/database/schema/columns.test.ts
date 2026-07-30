import { createTestDb } from "@/test/support/test-db"
import { and, eq, sql } from "drizzle-orm"
import { pgTable, text } from "drizzle-orm/pg-core"

import { notDeleted } from "../soft-delete"
import { auditColumns, primaryId } from "./columns"

/**
 * Two throwaway tables built from the same helpers. The point of the pair is
 * the first test: if the shared definition ever stops producing identical
 * columns, the convention has drifted and seven tables disagree.
 */
const widget = pgTable("audit_probe_widget", {
  id: primaryId(),
  name: text("name").notNull(),
  ...auditColumns,
})

const gadget = pgTable("audit_probe_gadget", {
  id: primaryId(),
  ...auditColumns,
})

const AUDIT_COLUMN_NAMES = [
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
]

const shapeOf = (table: typeof widget | typeof gadget) =>
  AUDIT_COLUMN_NAMES.map((name) => {
    const column = Object.values(table).find(
      (candidate) => candidate?.name === name
    )

    return {
      name: column.name,
      type: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
    }
  })

describe("the shared table convention", () => {
  it("gives two different tables identical audit columns", () => {
    expect(shapeOf(widget)).toEqual(shapeOf(gadget))
  })

  it("defines five audit columns, and no deleted_by", () => {
    expect(Object.keys(auditColumns)).toEqual([
      "createdAt",
      "createdBy",
      "updatedAt",
      "updatedBy",
      "deletedAt",
    ])
  })

  it("leaves the actor columns nullable, because a seed has no actor", () => {
    expect(widget.createdBy.notNull).toBe(false)
    expect(widget.updatedBy.notNull).toBe(false)
  })

  it("timestamps every audit column with a time zone", () => {
    for (const column of [
      widget.createdAt,
      widget.updatedAt,
      widget.deletedAt,
    ]) {
      expect(column.getSQLType()).toBe("timestamp with time zone")
    }
  })
})

describe("the convention against a real Postgres", () => {
  const { pool, db } = createTestDb()

  beforeAll(async () => {
    for (const table of ["audit_probe_widget", "audit_probe_gadget"]) {
      await pool.query(`DROP TABLE IF EXISTS ${table}`)
      await pool.query(`
        CREATE TABLE ${table} (
          id uuid PRIMARY KEY DEFAULT uuidv7(),
          ${table.endsWith("widget") ? "name text NOT NULL," : ""}
          created_at timestamptz NOT NULL DEFAULT now(),
          created_by uuid,
          updated_at timestamptz NOT NULL DEFAULT now(),
          updated_by uuid,
          deleted_at timestamptz
        )
      `)
    }
  })

  afterAll(async () => {
    await pool.query("DROP TABLE IF EXISTS audit_probe_widget")
    await pool.query("DROP TABLE IF EXISTS audit_probe_gadget")
    // Never `--forceExit`: close the pool instead.
    await pool.end()
  })

  it("gives a row a version 7 uuid when the application does not supply one", async () => {
    const [row] = await db
      .insert(widget)
      .values({ name: "left to the database" })
      .returning()

    // The version nibble is the first character of the third group.
    expect(row.id.split("-")[2].charAt(0)).toBe("7")
  })

  it("issues ids that sort into the order they were created", async () => {
    const ids: string[] = []
    for (let n = 0; n < 5; n += 1) {
      const [row] = await db
        .insert(widget)
        .values({ name: `n${n}` })
        .returning()
      ids.push(row.id)
    }

    expect([...ids].sort()).toEqual(ids)
  })

  it("accepts a null actor, because a seed has nobody to blame", async () => {
    const [row] = await db.insert(widget).values({ name: "seeded" }).returning()

    expect(row.createdBy).toBeNull()
    expect(row.updatedBy).toBeNull()
  })

  it("moves updated_at on an update and leaves created_at alone", async () => {
    const [stored] = await db
      .insert(widget)
      .values({ name: "before" })
      .returning()

    const [changed] = await db
      .update(widget)
      .set({ name: "after" })
      .where(eq(widget.id, stored.id))
      .returning()

    expect(changed.createdAt.getTime()).toBe(stored.createdAt.getTime())
    expect(changed.updatedAt.getTime()).toBeGreaterThan(
      stored.updatedAt.getTime()
    )
  })

  it("hides a soft-deleted row from reads but leaves it in the table", async () => {
    const [row] = await db
      .insert(widget)
      .values({ name: "to be removed" })
      .returning()

    await db
      .update(widget)
      .set({ deletedAt: sql`now()`, updatedBy: row.id })
      .where(eq(widget.id, row.id))

    const visible = await db
      .select()
      .from(widget)
      .where(and(eq(widget.id, row.id), notDeleted(widget)))
    const stillThere = await pool.query(
      "SELECT id, updated_by FROM audit_probe_widget WHERE id = $1",
      [row.id]
    )

    expect(visible).toHaveLength(0)
    expect(stillThere.rows).toHaveLength(1)
    // updated_by is who deleted it — the reason there is no deleted_by.
    expect(stillThere.rows[0].updated_by).toBe(row.id)
  })
})
