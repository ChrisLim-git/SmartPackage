import { and, eq } from "drizzle-orm"

import type { AuditContext } from "@domain/interfaces/audit-context"
import type { CustomerRepository } from "@domain/interfaces/customer-repository"
import { Customer } from "@domain/entities/customer"
import type { IdGenerator } from "@domain/interfaces/id-generator"
import { isErr } from "@domain/shared/result"

import type { Db, DbOrTx } from "../client"
import { customer } from "../schema/customer"
import { notDeleted } from "./soft-delete"

type CustomerRow = typeof customer.$inferSelect

/** A row is only ever built by this class, so an invalid one is a bug here, not bad input. */
const toEntity = (row: CustomerRow): Customer => {
  const entity = Customer.create({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    userId: row.userId,
  })

  if (isErr(entity)) {
    throw new Error(
      `customer ${row.id} cannot be read back from the database: ${entity.error.message}`
    )
  }

  return entity.value
}

export class DrizzleCustomerRepository implements CustomerRepository {
  constructor(
    private readonly db: DbOrTx,
    private readonly ids: IdGenerator
  ) {}

  async findById(id: string): Promise<Customer | null> {
    const [row] = await (this.db as Db)
      .select()
      .from(customer)
      .where(and(eq(customer.id, id), notDeleted(customer)))
      .limit(1)

    return row === undefined ? null : toEntity(row)
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const [row] = await (this.db as Db)
      .select()
      .from(customer)
      // Folded, because the entity folds on the way in and a caller may not
      // have gone through one.
      .where(
        and(
          eq(customer.email, email.trim().toLowerCase()),
          notDeleted(customer)
        )
      )
      .limit(1)

    return row === undefined ? null : toEntity(row)
  }

  async save(entity: Customer, actor: AuditContext): Promise<Customer> {
    const [row] = await (this.db as Db)
      .insert(customer)
      .values({
        id: entity.id,
        name: entity.name,
        email: entity.email,
        phone: entity.phone,
        userId: entity.userId,
        createdBy: actor.actingUserId,
        updatedBy: actor.actingUserId,
      })
      .onConflictDoUpdate({
        target: customer.id,
        set: {
          name: entity.name,
          email: entity.email,
          phone: entity.phone,
          userId: entity.userId,
          updatedBy: actor.actingUserId,
        },
      })
      .returning()

    return toEntity(row)
  }

  /**
   * One insert that yields either the new row or the one already there.
   *
   * A read followed by a write would let two agents storing packages for the
   * same new recipient at the same moment create two customers; the unique
   * index settles it instead, and `onConflictDoUpdate ... returning()` gives
   * back a row in both cases — unlike `onConflictDoNothing`, which returns
   * nothing when it loses.
   */
  async findOrCreateByEmail(
    details: { email: string; name: string; phone?: string | null },
    actor: AuditContext
  ): Promise<Customer> {
    const entity = Customer.create({
      id: this.ids.next(),
      name: details.name,
      email: details.email,
      phone: details.phone ?? null,
      userId: null,
    })

    if (isErr(entity)) {
      throw new Error(`cannot create a customer: ${entity.error.message}`)
    }

    const [row] = await (this.db as Db)
      .insert(customer)
      .values({
        id: entity.value.id,
        name: entity.value.name,
        email: entity.value.email,
        phone: entity.value.phone,
        createdBy: actor.actingUserId,
        updatedBy: actor.actingUserId,
      })
      .onConflictDoUpdate({
        target: customer.email,
        // Nothing about the existing person is overwritten: the agent typed an
        // address to find someone, not to rename them.
        set: { updatedBy: actor.actingUserId },
      })
      .returning()

    return toEntity(row)
  }
}
