import type { LockerSize, PackageSize } from "../utils/size"

/**
 * Whether a locker of a given capacity can hold a package of a given
 * requirement.
 *
 * A strategy rather than a method on `Locker`, because the rule is the part
 * most likely to change: today it is an ordinal rank comparison, and a
 * dimensional version that compares width, height and depth can replace it
 * without touching the entity or any caller. The ordinal implementation
 * arrives with its own ticket.
 */
export interface LockerFitService {
  fits(capacity: LockerSize, requirement: PackageSize): boolean
}
