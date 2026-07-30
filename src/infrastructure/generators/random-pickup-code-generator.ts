import { randomInt } from "node:crypto"

import type { PickupCodeGenerator } from "@domain/interfaces/pickup-code-generator"
import { PickupCode } from "@domain/value-objects/pickup-code"
import { isErr } from "@domain/shared/result"

const CODE_SPACE = 1_000_000

/**
 * Draws a pickup code from `node:crypto`.
 *
 * `randomInt` rather than `Math.random()`: the code is a bearer credential for
 * a physical object, and a predictable PRNG would let someone else's locker be
 * guessed. The draw is a number and the result is padded back to six
 * characters, so "000123" is as likely as any other code.
 */
export class RandomPickupCodeGenerator implements PickupCodeGenerator {
  generate(): PickupCode {
    const value = String(randomInt(0, CODE_SPACE)).padStart(6, "0")
    const code = PickupCode.create(value)

    if (isErr(code)) {
      // Unreachable: the padding guarantees the format. A throw here is a bug
      // in this class, which is exactly what an exception is for.
      throw new Error(`generated an invalid pickup code: ${code.error.message}`)
    }

    return code.value
  }
}
