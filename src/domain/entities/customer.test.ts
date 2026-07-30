import { isErr } from "../shared/result"
import { unwrap } from "@/test/support/unwrap"

import { Customer } from "./customer"

const aCustomer = (
  overrides: Partial<Parameters<typeof Customer.create>[0]> = {}
) =>
  Customer.create({
    id: "customer-1",
    name: "Rowan Recipient",
    email: "rowan@example.com",
    phone: null,
    userId: null,
    ...overrides,
  })

describe("Customer", () => {
  it("is complete without an account", () => {
    // The point of the whole entity: a recipient is a business fact, an
    // account is an authentication mechanism. The normal case here is someone
    // who never signs up, because the pickup code is the only credential they
    // need.
    const customer = unwrap(aCustomer({ userId: null }))

    expect(customer.userId).toBeNull()
    expect(customer.email).toBe("rowan@example.com")
  })

  it("stores the email folded, so it can be matched however it was typed", () => {
    expect(unwrap(aCustomer({ email: "Rowan@Example.COM" })).email).toBe(
      "rowan@example.com"
    )
  })

  it("keeps a customer reachable by phone alone", () => {
    const customer = unwrap(
      aCustomer({ email: null, phone: "+61 400 000 000" })
    )

    expect(customer.phone).toBe("+61 400 000 000")
    expect(customer.email).toBeNull()
  })

  it("refuses a customer nobody can be told about", () => {
    // No email and no phone is a package that can never be collected.
    expect(isErr(aCustomer({ email: null, phone: null }))).toBe(true)
  })

  it("refuses a malformed email", () => {
    for (const email of [
      "rowan",
      "rowan@",
      "@example.com",
      "a b@example.com",
    ]) {
      expect(isErr(aCustomer({ email }))).toBe(true)
    }
  })

  it("refuses an empty name", () => {
    expect(isErr(aCustomer({ name: "  " }))).toBe(true)
  })

  describe("linking an account later", () => {
    it("keeps the same identity, so existing packages still point at them", () => {
      const before = unwrap(aCustomer())

      const after = before.linkTo("user-123")

      expect(after.id).toBe(before.id)
      expect(after.userId).toBe("user-123")
      expect(after.email).toBe(before.email)
    })

    it("leaves the unlinked customer untouched", () => {
      const before = unwrap(aCustomer())

      before.linkTo("user-123")

      expect(before.userId).toBeNull()
    })
  })
})
