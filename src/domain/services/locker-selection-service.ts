import type { Locker } from "../entities/locker"
import type { NoSuitableLockerAvailable } from "../shared/errors"
import type { Result } from "../shared/result"
import type { PackageSize } from "../utils/size"

/**
 * Picks which candidate locker should hold a package. Takes a candidate set,
 * not a station id — scoping candidates is the caller's job.
 */
export interface LockerSelectionService {
  select(
    candidates: readonly Locker[],
    requirement: PackageSize
  ): Result<Locker, NoSuitableLockerAvailable>
}
