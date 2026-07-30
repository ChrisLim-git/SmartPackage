import type { Locker } from "../entities/locker"
import {
  type NoSuitableLockerAvailable,
  noSuitableLockerAvailable,
} from "../shared/errors"
import { err, ok, type Result } from "../shared/result"
import type { PackageSize } from "../value-objects/size"
import type { LockerFitPolicy } from "./locker-fit-policy"
import type { LockerSelectionPolicy } from "./locker-selection-policy"

/**
 * Picks the smallest free locker that can hold the package.
 *
 * "Smallest that fits", not "the same size": with no small locker free, a small
 * package belongs in a medium one rather than being refused. Reading the rule
 * as an exact match is the common way to get this wrong, and it turns a full
 * station into a rejected delivery while lockers stand empty.
 *
 * Ties break on label so the same candidate set always yields the same locker.
 * Left to the order rows came back in, one request would answer two ways.
 */
export class SmallestFitFirstPolicy implements LockerSelectionPolicy {
  constructor(private readonly fitPolicy: LockerFitPolicy) {}

  select(
    candidates: readonly Locker[],
    requirement: PackageSize
  ): Result<Locker, NoSuitableLockerAvailable> {
    const usable = candidates.filter(
      (locker) =>
        locker.isAvailable() &&
        locker.canAccommodate(requirement, this.fitPolicy)
    )

    // `filter` already copied, so sorting here cannot reorder the caller's array.
    const [best] = usable.sort(
      (a, b) =>
        a.size.rank - b.size.rank ||
        (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
    )

    // No station id: this policy was never told which station these lockers
    // belong to, and inventing one for the message would be a lie.
    return best === undefined ? err(noSuitableLockerAvailable()) : ok(best)
  }
}
