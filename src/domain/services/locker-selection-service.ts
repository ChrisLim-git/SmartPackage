import type { Locker } from "../entities/locker"
import type { NoSuitableLockerAvailable } from "../shared/errors"
import type { Result } from "../shared/result"
import type { PackageSize } from "../utils/size"

/**
 * Which of the lockers on offer should hold this package.
 *
 * Separate from `LockerFitService` because the two change for different
 * reasons: "does it fit" is physics, "which one do we prefer" is business —
 * smallest-first today, least-recently-used or load-balancing tomorrow.
 * Merged, adding dimensional fit would mean rewriting the preference logic.
 *
 * Takes a candidate set rather than a station id: the domain never learns that
 * stations exist, and scoping the candidates stays the caller's job.
 */
export interface LockerSelectionService {
  select(
    candidates: readonly Locker[],
    requirement: PackageSize
  ): Result<Locker, NoSuitableLockerAvailable>
}
