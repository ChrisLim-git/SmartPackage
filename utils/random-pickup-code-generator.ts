import { randomInt } from "node:crypto"

import type { PickupCodeGenerator } from "@domain/interfaces/pickup-code-generator"
import { isErr } from "@domain/shared/result"
import {
  PICKUP_CODE_ALPHABET,
  PICKUP_CODE_LENGTH,
  PickupCode,
} from "@domain/utils/pickup-code"

/**
 * Draws a pickup code from `node:crypto`.
 *
 * `randomInt` rather than `Math.random()`: the code is a bearer credential for a
 * physical object, and a predictable PRNG would let one code be guessed from
 * another. Each character is drawn independently from the domain's own alphabet,
 * and `randomInt(0, n)` is already rejection-sampled — so every character is
 * equally likely, which a `% n` over a wider random would not give.
 *
 * The alphabet and the length belong to the domain, not to this class. A
 * generator that decided the shape of a code could disagree with the value object
 * that validates it.
 */
export class RandomPickupCodeGenerator implements PickupCodeGenerator {
  generate(): PickupCode {
    const value = Array.from(
      { length: PICKUP_CODE_LENGTH },
      () => PICKUP_CODE_ALPHABET[randomInt(0, PICKUP_CODE_ALPHABET.length)]
    ).join("")

    const code = PickupCode.create(value)

    if (isErr(code)) {
      // Unreachable: every character came out of the alphabet the value object
      // validates against. A throw here is a bug in this class, which is exactly
      // what an exception is for.
      throw new Error(`generated an invalid pickup code: ${code.error.message}`)
    }

    return code.value
  }
}
