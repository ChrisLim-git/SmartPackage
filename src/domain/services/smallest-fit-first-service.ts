import type { Locker } from "../entities/locker"
import {
  type NoSuitableLockerAvailable,
  noSuitableLockerAvailable,
} from "../shared/errors"
import { err, ok, type Result } from "../shared/result"
import type { PackageSize } from "../utils/size"
import type { LockerFitService } from "./locker-fit-service"
import type { LockerSelectionService } from "./locker-selection-service"

/**
 * Picks the smallest free locker that fits — not an exact size match; a small
 * package goes in a medium locker. Ties break on label so selection is deterministic.
 */
export class SmallestFitFirstService implements LockerSelectionService {
  constructor(private readonly fitService: LockerFitService) {}

  select(
    candidates: readonly Locker[],
    requirement: PackageSize
  ): Result<Locker, NoSuitableLockerAvailable> {
    const usable = candidates.filter(
      (locker) =>
        locker.isAvailable() &&
        locker.canAccommodate(requirement, this.fitService)
    )

    // `filter` already copied, so sorting here cannot reorder the caller's array.
    const [best] = usable.sort(
      (a, b) =>
        a.size.rank - b.size.rank ||
        (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
    )

    return best === undefined ? err(noSuitableLockerAvailable()) : ok(best)
  }
}
