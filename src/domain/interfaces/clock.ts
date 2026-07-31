/** Time source for the domain; `new Date()` is banned here. Tests supply a fixed clock. */
export interface Clock {
  now(): Date
}
