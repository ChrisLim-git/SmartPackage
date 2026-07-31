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

  /**
   * One insert yielding either the new row or the existing one — a read then a
   * write would race two customers into existence. `onConflictDoUpdate ...
   * returning()` returns a row in both cases; `onConflictDoNothing` would not.
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
        // The existing person is never overwritten.
        set: { updatedBy: actor.actingUserId },
      })
      .returning()

    return this.toEntity(row)
  }
}
