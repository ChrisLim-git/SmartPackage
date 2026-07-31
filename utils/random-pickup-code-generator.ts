import { randomInt } from "node:crypto"

import type { PickupCodeGenerator } from "@domain/interfaces/pickup-code-generator"
import { isErr } from "@domain/shared/result"
import {
  PICKUP_CODE_ALPHABET,
  PICKUP_CODE_LENGTH,
  PickupCode,
} from "@domain/utils/pickup-code"

/**
 * `randomInt`, not `Math.random()`: the code is a bearer credential, and
 * `randomInt` is rejection-sampled so every character is equally likely.
 */
export class RandomPickupCodeGenerator implements PickupCodeGenerator {
  generate(): PickupCode {
    const value = Array.from(
      { length: PICKUP_CODE_LENGTH },
      () => PICKUP_CODE_ALPHABET[randomInt(0, PICKUP_CODE_ALPHABET.length)]
    ).join("")

    const code = PickupCode.create(value)

    if (isErr(code)) {
      // Unreachable: every character came out of the alphabet the value object validates.
      throw new Error(`generated an invalid pickup code: ${code.error.message}`)
    }

    return code.value
  }
}
