import type { Station } from "@domain/entities/station"

/**
 * Read-only, because nothing in scope creates a station.
 *
 * Stations arrive from the seed. Adding a `save` here for symmetry would be an
 * interface method with no caller, and the first person to read it would
 * reasonably assume an admin screen exists somewhere.
 */
export interface StationRepository {
  findById(id: string): Promise<Station | null>

  findAll(): Promise<Station[]>
}
