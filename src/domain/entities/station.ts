import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, ok, type Result } from "../shared/result"

export type StationAttributes = {
  readonly id: string
  readonly name: string
  readonly address: string
}

/** A location holding lockers; no behaviour of its own. */
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
      return err(malformedInput("station", "an address is required"))
    }

    return ok(new Station(attributes.id, name, address))
  }
}
