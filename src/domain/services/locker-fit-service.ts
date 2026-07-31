import type { LockerSize, PackageSize } from "../utils/size"

/** Strategy: can a locker of this capacity hold a package of this requirement? */
export interface LockerFitService {
  fits(capacity: LockerSize, requirement: PackageSize): boolean
}
