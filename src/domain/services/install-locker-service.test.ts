import { Locker } from "@domain/entities/locker"
import { Station } from "@domain/entities/station"
import { InstallLockerService } from "@domain/services/install-locker-service"
import { isErr, isOk } from "@domain/shared/result"
import { LockerSize } from "@domain/utils/size"

import {
  InMemoryLockerRepository,
  InMemoryLockerSizeRepository,
  InMemoryStationRepository,
} from "@/utils/in-memory-repositories"
import { unwrap } from "@/utils/unwrap"

/**
 * Installing a locker, as a domain flow rather than four checks in a route.
 *
 * The rules here — the size code is on the ladder, the station exists, the label
 * is free at that station — decide what the caller is told, and none of them is
 * an HTTP concern. Proven against in-memory fakes so each case is a line rather
 * than a fixture.
 */

const STATION_ID = "019fb1ad-d64b-7fe4-bde0-9c4044892047"
const ADMIN_ID = "019fb1ad-d64b-7fe4-bde0-9c40448920ff"

const audit = { actingUserId: ADMIN_ID }

const small = unwrap(LockerSize.create({ code: "S", rank: 1, label: "Small" }))
const large = unwrap(LockerSize.create({ code: "L", rank: 3, label: "Large" }))

const station = unwrap(
  Station.create({
    id: STATION_ID,
    name: "Central Mall",
    address: "1 Mall Way",
  })
)

const build = (existing: Locker[] = []) => {
  const lockers = new InMemoryLockerRepository(existing, [small, large])

  return {
    lockers,
    service: new InstallLockerService({
      lockers,
      lockerSizes: new InMemoryLockerSizeRepository([small, large]),
      stations: new InMemoryStationRepository([station]),
    }),
  }
}

const command = (
  overrides: Partial<{
    sizeCode: string
    label: string
    stationId: string
  }> = {}
) => ({
  stationId: STATION_ID,
  sizeCode: "L",
  label: "L1",
  audit,
  ...overrides,
})

describe("installing a locker", () => {
  it("installs it at the station, in the size the ladder names", async () => {
    const { service } = build()

    const result = await service.install(command())

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    expect(result.value.stationId).toBe(STATION_ID)
    expect(result.value.label).toBe("L1")
    expect(result.value.size.code).toBe("L")
  })

  it("leaves the new locker free, so an agent can use it immediately", async () => {
    const { service } = build()

    const result = await service.install(command())

    expect(isOk(result) && result.value.isAvailable()).toBe(true)
  })

  it("refuses a size code the ladder does not have", async () => {
    // The station may be wide open — telling the caller anything about capacity
    // would be a lie about their own typo.
    const { service, lockers } = build()

    const result = await service.install(command({ sizeCode: "XL" }))

    expect(isErr(result) && result.error.code).toBe("MalformedInput")
    expect(await lockers.findAll()).toHaveLength(0)
  })

  it("names the sizes that do exist when it refuses one that does not", async () => {
    const { service } = build()

    const result = await service.install(command({ sizeCode: "XL" }))

    expect(isErr(result) && result.error.message).toContain("S, L")
  })

  it("refuses a station that does not exist", async () => {
    // Without this the insert reaches a foreign key and the caller is told the
    // server broke, when what happened is that they named a station that is not
    // there.
    const { service } = build()

    const result = await service.install(
      command({ stationId: "019fb1ad-d64b-7fe4-bde0-000000000000" })
    )

    expect(isErr(result) && result.error.code).toBe("StationNotFound")
  })

  it("refuses a label already used at that station", async () => {
    const existing = unwrap(
      Locker.create({
        id: "locker-1",
        stationId: STATION_ID,
        size: large,
        label: "L1",
      })
    )
    const { service } = build([existing])

    const result = await service.install(command({ label: "L1" }))

    expect(isErr(result) && result.error.code).toBe("LockerLabelTaken")
  })

  it("allows the same label at a different station", async () => {
    // A label is a door number, unique where somebody is standing and nowhere
    // else. Two stations both having an `L1` is the normal case.
    const otherStationId = "019fb1ad-d64b-7fe4-bde0-9c4044892048"
    const other = unwrap(
      Station.create({
        id: otherStationId,
        name: "Riverside",
        address: "8 Quay",
      })
    )
    const lockers = new InMemoryLockerRepository(
      [
        unwrap(
          Locker.create({
            id: "locker-1",
            stationId: STATION_ID,
            size: large,
            label: "L1",
          })
        ),
      ],
      [small, large]
    )
    const service = new InstallLockerService({
      lockers,
      lockerSizes: new InMemoryLockerSizeRepository([small, large]),
      stations: new InMemoryStationRepository([station, other]),
    })

    const result = await service.install(
      command({ stationId: otherStationId, label: "L1" })
    )

    expect(isOk(result)).toBe(true)
  })

  it("checks the size before it checks the label, so a typo is not reported as a conflict", async () => {
    const existing = unwrap(
      Locker.create({
        id: "locker-1",
        stationId: STATION_ID,
        size: large,
        label: "L1",
      })
    )
    const { service } = build([existing])

    const result = await service.install(
      command({ sizeCode: "XL", label: "L1" })
    )

    expect(isErr(result) && result.error.code).toBe("MalformedInput")
  })
})
