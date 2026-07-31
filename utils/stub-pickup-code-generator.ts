import type { PickupCodeGenerator } from "@domain/interfaces/pickup-code-generator"
import { isErr } from "@domain/shared/result"
import { PickupCode } from "@domain/utils/pickup-code"

/** Hands out a fixed queue of pickup codes, in order. */
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
      // No wrap-around: a test that outruns its stub should fail loudly.
      throw new Error(
        `StubPickupCodeGenerator exhausted after ${this.queue.length} code(s)`
      )
    }

    this.issued += 1
    return next
  }
}
