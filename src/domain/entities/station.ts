import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

export type StationAttributes = {
  readonly id: string
  readonly name: string
  readonly address: string
}

/**
 * A location holding lockers.
 *
 * Deliberately thin — a station has no behaviour, because every rule that could
 * live here is really about the lockers inside it. It exists as an entity
 * rather than a row shape so a repository has something to return that a
 * domain service or a route handler can hold without knowing what a database
 * is.
 */
export class Station {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly address: string
  ) {}

  static create(
    attributes: StationAttributes
  ): Result<Station, MalformedInput> {
    const name = attributes.name.trim()
    const address = attributes.address.trim()

    if (attributes.id.trim().length === 0) {
      return err(malformedInput("station", "an id is required"))
    }
    if (name.length === 0) {
      return err(malformedInput("station", "a name is required"))
    }
    if (address.length === 0) {
      // A station nobody can find is not somewhere a package can be collected.
      return err(malformedInput("station", "an address is required"))
    }

    return ok(new Station(attributes.id, name, address))
  }
}
