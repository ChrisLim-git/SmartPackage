/**
 * The sizing the agent and collect screens need, in one place.
 *
 * `radix-mira` is a compact preset: `Input` is `h-7`, `Button size="lg"` is `h-8`,
 * and `SelectTrigger` tops out at `h-7` — 28 to 32 pixels, which is right for the
 * dense admin tables and wrong for someone tapping at a locker wall. DESIGN.md
 * asks for ≥44px on the field surfaces, so those surfaces state a height rather
 * than trusting a variant name.
 *
 * The type sizes are here for the same reason: the preset's controls are `text-sm`
 * dropping to `text-xs` at `md`, and DESIGN.md's rule is that body type never goes
 * below 1rem where a person is standing up and holding a phone.
 */
export const FIELD_CONTROL = "h-11 w-full text-base md:text-base"

export const FIELD_SUBMIT = "h-12 w-full text-base md:text-base"

/**
 * The select needs its own, because `SelectTrigger` sets its height through
 * `data-[size=default]:h-7`. An attribute-variant selector out-specifies a plain
 * `h-11`, so the preset's 28 pixels win silently — the class is present in the
 * markup and does nothing. Overriding the same variant is what actually lands.
 */
export const FIELD_SELECT =
  "w-full text-base data-[size=default]:h-11 md:text-base"
