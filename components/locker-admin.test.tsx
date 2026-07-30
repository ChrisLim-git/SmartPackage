/** @jest-environment jsdom */

import { jest } from "@jest/globals"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"

import type { LockerDto, LockerSizeDto, StationDto } from "@dtos/master-data"

const CENTRAL = "11111111-1111-7111-8111-111111111111"
const HARBOUR = "22222222-2222-7222-8222-222222222222"

const STATIONS: StationDto[] = [
  { id: CENTRAL, name: "Central", address: "1 Station Road" },
  { id: HARBOUR, name: "Harbour", address: "2 Dock Street" },
]

const SIZES: LockerSizeDto[] = [
  { code: "S", rank: 1, label: "Small" },
  { code: "M", rank: 2, label: "Medium" },
  { code: "L", rank: 3, label: "Large" },
]

const locker = (
  id: string,
  stationId: string,
  size: LockerSizeDto,
  status: LockerDto["status"]
): LockerDto => ({ id, stationId, label: id, status, size })

const LOCKERS: LockerDto[] = [
  locker("A1", CENTRAL, SIZES[0], "available"),
  locker("A2", CENTRAL, SIZES[0], "occupied"),
  locker("C1", CENTRAL, SIZES[2], "available"),
  locker("C2", CENTRAL, SIZES[2], "available"),
  locker("C3", CENTRAL, SIZES[2], "available"),
  locker("B1", HARBOUR, SIZES[1], "occupied"),
]

const BODIES: Record<string, unknown> = {
  "/stations": STATIONS,
  "/locker-sizes": SIZES,
  "/lockers": LOCKERS,
}

/**
 * Stubbed at `hooks/api`, which is the seam that belongs to this test.
 *
 * Not at `fetch`: the client is axios, so a `fetch` stub in jsdom intercepts
 * nothing — axios reaches for `XMLHttpRequest` — and a test asserting a rendered
 * count has no business knowing which transport is underneath. One level down,
 * the hooks and the interceptor still run for real.
 */
/** Paths set here fail the next request, so a test can break one query at a time. */
const failing = new Set<string>()

jest.unstable_mockModule("@/hooks/api", () => ({
  get: async (path: string) => {
    if (failing.has(path)) throw new Error("Request failed")
    if (!(path in BODIES)) throw new Error(`unexpected request: ${path}`)

    return BODIES[path]
  },
  post: async () => {
    throw new Error("this test creates nothing")
  },
  queryKeys: {
    stations: ["stations"],
    lockerSizes: ["locker-sizes"],
    lockers: ["lockers"],
  },
}))

// After the mock is registered: an ESM graph resolves on import, so a static
// import of the component would bind the real client first.
const { LockerAdmin } = await import("./locker-admin")

const renderAdmin = () => {
  // No retries: a failing query would otherwise be retried three times before
  // the test could see it, and every assertion here is about the first answer.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <LockerAdmin />
    </QueryClientProvider>
  )
}

const capacityCells = async (station: string) => {
  const table = (await screen.findAllByRole("table"))[0]
  // `findByRole`, not `getByRole`: the table renders skeleton rows first, so a
  // synchronous query resolves against the loading state and reads empty.
  const row = await within(table).findByRole("row", {
    name: new RegExp(`^${station}`),
  })

  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent)
}

/**
 * Level 1's *"viewing the list of lockers along with their current availability
 * status"* is a count, and the count is derived here rather than by the API —
 * which makes this the only place it can be checked.
 */
describe("the locker capacity table", () => {
  it("counts free against total, per station and per size", async () => {
    renderAdmin()

    // Central: one of two smalls free, no mediums at all, all three larges free.
    expect(await capacityCells("Central")).toEqual([
      "Central",
      "1 / 2",
      "0 / 0",
      "3 / 3",
    ])
  })

  it("reads a size with none free differently from a size with none at all", async () => {
    renderAdmin()

    // Harbour's only locker is an occupied medium. "0 / 1" is a station under
    // pressure; "0 / 0" is a size that was never installed. Collapsing the two
    // into an empty cell would hide the first.
    expect(await capacityCells("Harbour")).toEqual([
      "Harbour",
      "0 / 0",
      "0 / 1",
      "0 / 0",
    ])
  })

  it("lists every locker until a station is chosen", async () => {
    renderAdmin()

    const lockerTable = (await screen.findAllByRole("table"))[1]
    await within(lockerTable).findByText("A1")

    const labels = within(lockerTable)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0].textContent)

    expect(labels).toEqual(["A1", "A2", "C1", "C2", "C3", "B1"])
  })
})

/**
 * A failed load and an empty estate look identical unless the screen says
 * otherwise, and they call for opposite actions: one is "try again", the other
 * is "add a locker". Silence lets an operator conclude there are no stations.
 */
describe("when a request fails", () => {
  afterEach(() => failing.clear())

  it("says so when the stations could not be loaded", async () => {
    failing.add("/stations")

    renderAdmin()

    expect(await screen.findByRole("alert")).toHaveTextContent(/stations/i)
  })

  it("says so when the locker sizes could not be loaded", async () => {
    // The sizes are the capacity table's columns. Without them the table has a
    // heading row and nothing under it, which reads as an estate with no lockers.
    failing.add("/locker-sizes")

    renderAdmin()

    expect(await screen.findByRole("alert")).toHaveTextContent(/sizes/i)
  })

  it("says so when the lockers could not be loaded", async () => {
    failing.add("/lockers")

    renderAdmin()

    expect(await screen.findByRole("alert")).toHaveTextContent(/lockers/i)
  })

  it("names every part that failed, not just the first", async () => {
    failing.add("/stations")
    failing.add("/lockers")

    renderAdmin()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/stations/i)
    expect(alert).toHaveTextContent(/lockers/i)
  })

  it("offers a way to try again", async () => {
    failing.add("/lockers")

    renderAdmin()

    const alert = await screen.findByRole("alert")
    expect(within(alert).getByRole("button")).toHaveTextContent(/try again/i)
  })

  it("does not claim the station has no lockers when the request failed", async () => {
    // The empty state is a statement of fact about the estate. Rendering it
    // over a failed request states something the screen does not know.
    failing.add("/lockers")

    renderAdmin()
    await screen.findByRole("alert")

    expect(screen.queryByText(/no lockers at this station yet/i)).toBeNull()
  })

  it("refuses to open the add-locker dialog when its choices are missing", async () => {
    // The dialog needs stations and sizes to offer. Opened without them it is a
    // form that cannot be completed and does not say why.
    failing.add("/stations")

    renderAdmin()
    await screen.findByRole("alert")

    expect(screen.getByRole("button", { name: /add locker/i })).toBeDisabled()
  })

  it("keeps working when nothing failed", async () => {
    renderAdmin()
    await screen.findAllByRole("table")

    expect(screen.queryByRole("alert")).toBeNull()
  })
})
