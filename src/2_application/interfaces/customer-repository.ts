import type { Customer } from "@domain/entities/customer"

import type { AuditContext } from "./audit-context"

/**
 * What the application needs from customer storage, declared here rather than
 * where it is implemented — this is where the dependency inverts.
 *
 * `findOrCreateByEmail` is a business operation, not two database calls in a
 * trench coat. An agent standing at a locker types a recipient's address; if
 * that person is not known yet they become known, with no account, no
 * invitation and nothing for the agent to resolve. Expressing it as one method
 * also keeps the race in one place, where a unique index can settle it.
 */
export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>

  findByEmail(email: string): Promise<Customer | null>

  save(customer: Customer, actor: AuditContext): Promise<Customer>

  findOrCreateByEmail(
    details: { email: string; name: string; phone?: string | null },
    actor: AuditContext
  ): Promise<Customer>
}
