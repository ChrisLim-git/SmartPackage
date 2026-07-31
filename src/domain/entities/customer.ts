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
 * The person a package is for — distinct from the auth `user`; a recipient may
 * never sign up. `userId` is a nullable link, not a prerequisite.
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
    // Email folded once here so every downstream comparison matches.
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

  /** Attaches an account; same `id`, so existing packages keep pointing at this recipient. */
  linkTo(userId: string): Customer {
    return new Customer(this.id, this.name, this.email, this.phone, userId)
  }
}
