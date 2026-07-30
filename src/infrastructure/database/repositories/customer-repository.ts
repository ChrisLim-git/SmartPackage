import { and, eq } from "drizzle-orm"

import { Customer } from "@domain/entities/customer"
import type { AuditContext } from "@domain/interfaces/audit-context"
import type { IdGenerator } from "@domain/interfaces/id-generator"
import { isErr } from "@domain/shared/result"

import type { DbOrTx } from "../client"
import { customer } from "../schema/customer"
import { EntityRepository } from "./base-repository"

type CustomerRow = typeof customer.$inferSelect

export class CustomerRepository extends EntityRepository<
  Customer,
  typeof customer
> {
  protected readonly table = customer

  constructor(
    db: DbOrTx,
    private readonly ids: IdGenerator
  ) {
    super(db)
  }

  protected toEntity(row: CustomerRow): Customer {
    return this.rebuilt(
      Customer.create({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        userId: row.userId,
      }),
      row.id
    )
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const [row] = await this.query
      .select()
      .from(customer)
      // Folded, because the entity folds on the way in and a caller may not
      // have gone through one.
      .where(and(eq(customer.email, email.trim().toLowerCase()), this.visible))
      .limit(1)

    return row === undefined ? null : this.toEntity(row)
  }

  async save(entity: Customer, actor: AuditContext): Promise<Customer> {
    const [row] = await this.query
      .insert(customer)
      .values({
        id: entity.id,
        name: entity.name,
        email: entity.email,
        phone: entity.phone,
        userId: entity.userId,
        ...this.stamp(actor),
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

    return this.toEntity(row)
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

    const [row] = await this.query
      .insert(customer)
      .values({
        id: entity.value.id,
        name: entity.value.name,
        email: entity.value.email,
        phone: entity.value.phone,
        ...this.stamp(actor),
      })
      .onConflictDoUpdate({
        target: customer.email,
        // Nothing about the existing person is overwritten: the agent typed an
        // address to find someone, not to rename them.
        set: { updatedBy: actor.actingUserId },
      })
      .returning()

    return this.toEntity(row)
  }
}
