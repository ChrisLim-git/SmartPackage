/**
 * Sizing for the agent and collect screens. The `radix-mira` preset's 28-32px
 * controls suit admin tables; DESIGN.md requires ≥44px and ≥1rem type on field surfaces.
 */
export const FIELD_CONTROL = "h-11 w-full text-base md:text-base"

export const FIELD_SUBMIT = "h-12 w-full text-base md:text-base"

/**
 * `SelectTrigger` sets height via `data-[size=default]:h-7`, which out-specifies
 * a plain `h-11` — only overriding the same variant lands.
 */
export const FIELD_SELECT =
  "w-full text-base data-[size=default]:h-11 md:text-base"

/** `SelectItem` carries its own `min-h-7`; the trigger's height says nothing about the menu rows. */
export const FIELD_SELECT_ITEM = "min-h-11 text-base"

/**
 * The preset's 12px labels/errors are right for admin tables, wrong on field
 * surfaces where DESIGN.md keeps body type at or near 1rem.
 */
export const FIELD_LABEL = "text-base"

export const FIELD_ERROR = "text-[0.9375rem]"
