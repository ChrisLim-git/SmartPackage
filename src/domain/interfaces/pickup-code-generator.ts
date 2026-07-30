import type { PickupCode } from "../utils/pickup-code"

/**
 * Where new pickup codes come from.
 *
 * An interface rather than a function in the domain because the real implementation
 * needs a cryptographic random source, and `crypto` inside the domain would
 * make every test that stores a package unpredictable. Infrastructure supplies
 * `RandomPickupCodeGenerator`; tests supply a queue.
 */
export interface PickupCodeGenerator {
  generate(): PickupCode
}
