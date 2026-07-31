import type { PickupCode } from "../utils/pickup-code"

/** Source of new pickup codes; real implementation is cryptographically random. */
export interface PickupCodeGenerator {
  generate(): PickupCode
}
