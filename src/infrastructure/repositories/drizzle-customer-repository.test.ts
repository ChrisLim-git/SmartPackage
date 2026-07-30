import { createTestDb } from "@/test/support/test-db"
import { unwrap } from "@/test/support/unwrap"

import { SYSTEM_ACTOR } from "@application/interfaces/audit-context"
import { Customer } from "@domain/entities/customer"

import { UuidV7Generator } from "../generators/uuid-v7-generator"
import { DrizzleCustomerRepository } from "./drizzle-customer-repository"

const { pool, db } = createTestDb()

// The real generator, not `SequentialIdGenerator`: the column is `uuid`, and a
// double emitting "customer-0001" would only prove Postgres rejects it. A
// domain test can use readable ids; a test against the schema cannot.
const ids = new UuidV7Generator()

const repository = () => new DrizzleCustomerRepository(db, ids)

/**
 * Inserts an account and returns the id the database gave it.
 *
 * The id is never supplied: `user.id` belongs to BetterAuth's configuration,
 * and a test that hard-codes its shape stops noticing when that shape changes.
 */
const insertUser = async (email: string): Promise<string> => {
  const { rows } = await pool.query(
    `INSERT INTO "user" (name, email, email_verified, created_at, updated_at)
     VALUES ('Ari Agent', $1, false, now(), now())
     RETURNING id`,
    [email]
  )

  return rows[0].id
}

describe("DrizzleCustomerRepository", () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM customer")
  })

  afterAll(async () => {
    await pool.query("DELETE FROM customer")
    await pool.query(`DELETE FROM "user" WHERE email LIKE '%@example.com'`)
    await pool.end()
  })

  it("stores a customer who has no account", async () => {
    const customers = repository()
    const id = ids.next()
    const rowan = unwrap(
      Customer.create({
        id,
        name: "Rowan Recipient",
        email: "rowan@example.com",
        phone: null,
        userId: null,
      })
    )

    const saved = await customers.save(rowan, SYSTEM_ACTOR)

    expect(saved.userId).toBeNull()
    expect((await customers.findById(id))?.email).toBe("rowan@example.com")
  })

  it("finds an existing customer rather than creating a second one", async () => {
    const customers = repository()

    const first = await customers.findOrCreateByEmail(
      { email: "rowan@example.com", name: "Rowan Recipient" },
      SYSTEM_ACTOR
    )
    const second = await customers.findOrCreateByEmail(
      { email: "rowan@example.com", name: "Rowan Recipient" },
      SYSTEM_ACTOR
    )

    expect(second.id).toBe(first.id)
    const count = await pool.query("SELECT count(*)::int AS n FROM customer")
    expect(count.rows[0].n).toBe(1)
  })

  it("matches an address however the agent capitalised it", async () => {
    const customers = repository()
    const created = await customers.findOrCreateByEmail(
      { email: "rowan@example.com", name: "Rowan Recipient" },
      SYSTEM_ACTOR
    )

    const found = await customers.findOrCreateByEmail(
      { email: "Rowan@Example.COM", name: "Rowan Typed Differently" },
      SYSTEM_ACTOR
    )

    expect(found.id).toBe(created.id)
    // The agent was looking someone up, not renaming them.
    expect(found.name).toBe("Rowan Recipient")
  })

  it("finds by email through the read path too", async () => {
    const customers = repository()
    await customers.findOrCreateByEmail(
      { email: "rowan@example.com", name: "Rowan Recipient" },
      SYSTEM_ACTOR
    )

    expect((await customers.findByEmail("ROWAN@example.com"))?.name).toBe(
      "Rowan Recipient"
    )
  })

  it("stamps who wrote the row, and tolerates nobody having", async () => {
    const customers = repository()

    const created = await customers.findOrCreateByEmail(
      { email: "rowan@example.com", name: "Rowan Recipient" },
      SYSTEM_ACTOR
    )

    const row = await pool.query(
      "SELECT created_by, updated_by FROM customer WHERE id = $1",
      [created.id]
    )
    expect(row.rows[0].created_by).toBeNull()
    expect(row.rows[0].updated_by).toBeNull()
  })

  it("stamps a real acting user into the actor columns", async () => {
    const customers = repository()
    // The id is read back from `user`, never invented here. Whether the actor
    // columns can hold a real user id is the entire point of this test, so
    // writing the shape into it by hand would only test the hand-written
    // shape. Every other test passes SYSTEM_ACTOR, which is null and fits any
    // column type — that is how a mismatch stayed invisible for a whole phase.
    const agentId = await insertUser("ari-agent@example.com")

    const created = await customers.findOrCreateByEmail(
      { email: "rowan@example.com", name: "Rowan Recipient" },
      { actingUserId: agentId }
    )

    const row = await pool.query(
      "SELECT created_by, updated_by FROM customer WHERE id = $1",
      [created.id]
    )
    expect(row.rows[0].created_by).toBe(agentId)
    expect(row.rows[0].updated_by).toBe(agentId)
  })

  it("keeps the same row when an account is linked later", async () => {
    const customers = repository()
    const created = await customers.findOrCreateByEmail(
      { email: "rowan@example.com", name: "Rowan Recipient" },
      SYSTEM_ACTOR
    )
    // A real account: `user_id` is a foreign key, so an invented id is
    // rejected — which is the constraint doing its job.
    const accountId = await insertUser("rowan-account@example.com")

    const linked = await customers.save(created.linkTo(accountId), SYSTEM_ACTOR)

    expect(linked.id).toBe(created.id)
    expect(linked.userId).toBe(accountId)
    // Signing up joined the record that was already there rather than
    // starting a second one.
    const count = await pool.query("SELECT count(*)::int AS n FROM customer")
    expect(count.rows[0].n).toBe(1)
  })

  it("hides a soft-deleted customer from reads", async () => {
    const customers = repository()
    const created = await customers.findOrCreateByEmail(
      { email: "rowan@example.com", name: "Rowan Recipient" },
      SYSTEM_ACTOR
    )

    await pool.query("UPDATE customer SET deleted_at = now() WHERE id = $1", [
      created.id,
    ])

    expect(await customers.findById(created.id)).toBeNull()
    expect(await customers.findByEmail("rowan@example.com")).toBeNull()
  })
})
