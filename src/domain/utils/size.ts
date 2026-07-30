import { type MalformedInput, malformedInput } from "../shared/errors"
import { err, isErr, ok, type Result } from "../shared/result"

/** The shape of a `locker_size` row, before it is validated into a size. */
export type SizeAttributes = {
  readonly code: string
  readonly rank: number
  readonly label: string
}

const validate = (
  attributes: SizeAttributes
): Result<SizeAttributes, MalformedInput> => {
  const code = attributes.code.trim()
  const label = attributes.label.trim()

  if (code.length === 0) {
    return err(malformedInput("size", "a code is required"))
  }
  if (label.length === 0) {
    return err(malformedInput("size", "a label is required"))
  }
  if (!Number.isInteger(attributes.rank)) {
    return err(malformedInput("size", "rank must be a whole number"))
  }
  if (attributes.rank < 1) {
    return err(malformedInput("size", "rank must be at least 1"))
  }

  return ok({ code, rank: attributes.rank, label })
}

/**
 * A size, ordered by an integer `rank` that arrives from master data.
 *
 * There is no `S | M | L` enum anywhere in the domain on purpose: the sizes are
 * rows, and a fourth one is an insert rather than a deployment. Everything that
 * compares sizes compares ranks, so nothing has to change when one is added.
 */
export abstract class Size {
  protected constructor(
    readonly code: string,
    readonly rank: number,
    readonly label: string
  ) {}

  /**
   * Keeps the two subclasses apart nominally. TypeScript is structural, so
   * without a differing property type a `PackageSize` would be assignable to a
   * `LockerSize` and a fit check could be written backwards without complaint.
   */
  protected abstract readonly kind: "locker" | "package"

  /** Reflexive: a size is always at least itself. */
  isAtLeast(other: this): boolean {
    return this.rank >= other.rank
  }

  isSmallerThan(other: this): boolean {
    return this.rank < other.rank
  }

  /** Value equality — code and rank, never object identity. */
  equals(other: this): boolean {
    return this.code === other.code && this.rank === other.rank
  }

  /** Comparator for ascending rank, across either kind: `sizes.sort(Size.byRank)`. */
  static byRank(a: Size, b: Size): number {
    return a.rank - b.rank
  }
}

/** What a locker can hold. */
export class LockerSize extends Size {
  protected readonly kind = "locker" as const

  private constructor(attributes: SizeAttributes) {
    super(attributes.code, attributes.rank, attributes.label)
  }

  static create(
    attributes: SizeAttributes
  ): Result<LockerSize, MalformedInput> {
    const validated = validate(attributes)

    return isErr(validated) ? validated : ok(new LockerSize(validated.value))
  }
}

/** What a package needs. Not the same thing as a locker's capacity, and not assignable to it. */
export class PackageSize extends Size {
  protected readonly kind = "package" as const

  private constructor(attributes: SizeAttributes) {
    super(attributes.code, attributes.rank, attributes.label)
  }

  static create(
    attributes: SizeAttributes
  ): Result<PackageSize, MalformedInput> {
    const validated = validate(attributes)

    return isErr(validated) ? validated : ok(new PackageSize(validated.value))
  }
}
