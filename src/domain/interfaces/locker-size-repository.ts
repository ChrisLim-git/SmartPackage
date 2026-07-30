import type { LockerSize } from "../utils/size"

/**
 * The size ladder, read-only.
 *
 * Sizes are reference data an administrator picks from, not something the
 * application creates — adding one is a seed change, which keeps the ranks
 * deliberate rather than whatever order a form was submitted in.
 */
export interface LockerSizeRepository {
  findAll(): Promise<LockerSize[]>
}
