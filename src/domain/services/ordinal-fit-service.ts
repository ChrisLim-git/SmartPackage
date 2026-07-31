import type { LockerSize, PackageSize } from "../utils/size"
import type { LockerFitService } from "./locker-fit-service"

/** A package fits a locker whose rank is at least its own; boundary inclusive. */
export class OrdinalFitService implements LockerFitService {
  fits(capacity: LockerSize, requirement: PackageSize): boolean {
    return capacity.rank >= requirement.rank
  }
}
