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
 * A size ordered by integer `rank` from master data; no `S | M | L` enum, so
 * adding a size is an insert. Comparisons only use rank.
 */
export abstract class Size {
  protected constructor(
    readonly code: string,
    readonly rank: number,
    readonly label: string
  ) {}

  /**
   * Nominal brand: without it, structural typing would let a `PackageSize`
   * be assigned where a `LockerSize` is required.
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

/**
 * Resolves an operator-typed code against master data; an unknown code is the
 * caller's typo and the error names the valid codes.
 */
export const findSizeByCode = <TSize extends Size>(
  ladder: readonly TSize[],
  code: string,
  field: string
): Result<TSize, MalformedInput> => {
  const match = ladder.find((size) => size.code === code)

  if (match === undefined) {
    return err(
      malformedInput(
        field,
        `"${code}" is not a known size — the sizes are ${ladder
          .map((size) => size.code)
          .join(", ")}`
      )
    )
  }

  return ok(match)
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
