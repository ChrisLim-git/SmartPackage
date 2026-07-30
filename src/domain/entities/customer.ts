import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

/** Deliberately permissive: enough to catch a typo, not enough to reject a valid oddity. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CustomerAttributes = {
  readonly id: string
  readonly name: string
  readonly email: string | null
  readonly phone: string | null
  readonly userId: string | null
}

/**
 * The person a package is for.
 *
 * Separate from the auth `user` on purpose, and this is the modelling decision
 * worth defending: a recipient is a business fact, an account is an
 * authentication mechanism. Conflating them makes it impossible to represent a
 * package delivered to someone who never signs up — which is the ordinary case
 * here, because the pickup code is the only credential a customer needs.
 *
 * `userId` is therefore nullable, and stays nullable. It is a link that may
 * appear later, not a prerequisite for existing.
 */
export class Customer {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly email: string | null,
    readonly phone: string | null,
    readonly userId: string | null
  ) {}

  static create(
    attributes: CustomerAttributes
  ): Result<Customer, MalformedInput> {
    const name = attributes.name.trim()
    // Folded once, here, so every comparison downstream is against the same
    // form and an agent typing Bob@x.com finds bob@x.com.
    const email = attributes.email?.trim().toLowerCase() ?? null
    const phone = attributes.phone?.trim() ?? null

    if (name.length === 0) {
      return err(malformedInput("customer", "a name is required"))
    }
    if (email !== null && !EMAIL_PATTERN.test(email)) {
      return err(
        malformedInput("customer", `"${email}" is not an email address`)
      )
    }
    if (email === null && (phone === null || phone.length === 0)) {
      // A recipient nobody can reach is a package that can never be collected.
      return err(
        malformedInput(
          "customer",
          "an email address or a phone number is required"
        )
      )
    }

    return ok(
      new Customer(attributes.id, name, email, phone, attributes.userId)
    )
  }

  /**
   * Attaches an account to an existing recipient.
   *
   * Returns a new customer with the same `id`, so every package already
   * pointing at them keeps pointing at them — signing up joins a record that
   * was already there rather than starting a second one.
   */
  linkTo(userId: string): Customer {
    return new Customer(this.id, this.name, this.email, this.phone, userId)
  }
}
