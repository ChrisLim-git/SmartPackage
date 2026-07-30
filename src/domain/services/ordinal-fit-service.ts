import type { LockerSize, PackageSize } from "../utils/size"
import type { LockerFitService } from "./locker-fit-service"

/**
 * A package fits a locker whose rank is at least its own.
 *
 * The whole rule, and the reason sizes carry an integer rank instead of a
 * letter: adding XL is a row, and this comparison keeps working. The boundary
 * is inclusive — a medium package fits a medium locker.
 */
export class OrdinalFitService implements LockerFitService {
  fits(capacity: LockerSize, requirement: PackageSize): boolean {
    return capacity.rank >= requirement.rank
  }
}
