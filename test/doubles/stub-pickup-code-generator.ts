import type { PickupCodeGenerator } from "@domain/ports/pickup-code-generator"
import { isErr } from "@domain/shared/result"
import { PickupCode } from "@domain/value-objects/pickup-code"

/**
 * Hands out a fixed queue of pickup codes, in order.
 *
 * Every test that stores a package needs to know which code came out, and this
 * is what makes that possible without a mocking framework.
 */
export class StubPickupCodeGenerator implements PickupCodeGenerator {
  private readonly queue: PickupCode[]
  private issued = 0

  constructor(codes: string[]) {
    this.queue = codes.map((value) => {
      const code = PickupCode.create(value)
      if (isErr(code)) {
        throw new Error(
          `StubPickupCodeGenerator was queued an invalid code: ${value}`
        )
      }
      return code.value
    })
  }

  generate(): PickupCode {
    const next = this.queue[this.issued]

    if (next === undefined) {
      // Wrapping around would let a test quietly assert against a code it
      // never queued. A test that outruns its stub should fail loudly.
      throw new Error(
        `StubPickupCodeGenerator exhausted after ${this.queue.length} code(s)`
      )
    }

    this.issued += 1
    return next
  }
}
