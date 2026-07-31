/**
 * Switch for the reviewer affordances (role picker, test-parcel panel).
 * On outside production; opt in on a hosted demo with NEXT_PUBLIC_DEMO_MODE=true.
 */
export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  process.env.NODE_ENV !== "production"

/** The seeded staff accounts. Restated here so no client imports the seed. */
export const DEMO_ACCOUNTS = [
  {
    role: "admin",
    email: "admin@smartpackage.test",
    description: "Stations, lockers and capacity",
  },
  {
    role: "agent",
    email: "agent@smartpackage.test",
    description: "Stores parcels into lockers",
  },
] as const

export const DEMO_PASSWORD = "smartpackage"
