import { RegisterStationService } from "@domain/services/register-station-service"
import { isErr, isOk } from "@domain/shared/result"

import { InMemoryStationRepository } from "@/utils/in-memory-repositories"

/**
 * Bringing a station online.
 *
 * A station has no behaviour of its own — every rule that could live on one is
 * really about the lockers inside it — so what is worth asserting here is that
 * a half-formed station never reaches the database, and that a name is not
 * treated as an identity.
 */

const ADMIN_ID = "019fb1ad-d64b-7fe4-bde0-9c40448920ff"

const audit = { actingUserId: ADMIN_ID }

const build = () => {
  const stations = new InMemoryStationRepository([])

  return { stations, service: new RegisterStationService({ stations }) }
}

const command = (
  overrides: Partial<{ name: string; address: string }> = {}
) => ({
  name: "Central Mall",
  address: "180 Bourke Street, Melbourne",
  audit,
  ...overrides,
})

describe("registering a station", () => {
  it("registers it and gives it an id", async () => {
    const { service } = build()

    const result = await service.register(command())

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    expect(result.value.name).toBe("Central Mall")
    expect(result.value.address).toBe("180 Bourke Street, Melbourne")
    expect(result.value.id).not.toHaveLength(0)
  })

  it("makes it findable straight away, so lockers can be added to it", async () => {
    // The whole point of the interface: story 27 asks for a locker so a station
    // can be brought online, and until this existed that took a seed run.
    const { service, stations } = build()

    const registered = await service.register(command())

    expect(isOk(registered)).toBe(true)
    if (!isOk(registered)) return

    expect(await stations.findById(registered.value.id)).not.toBeNull()
  })

  it("refuses a station with no name", async () => {
    const { service, stations } = build()

    const result = await service.register(command({ name: "   " }))

    expect(isErr(result) && result.error.code).toBe("MalformedInput")
    expect(await stations.findAll()).toHaveLength(0)
  })

  it("refuses a station with no address", async () => {
    // A station nobody can find is not somewhere a package can be collected.
    const { service, stations } = build()

    const result = await service.register(command({ address: "" }))

    expect(isErr(result) && result.error.code).toBe("MalformedInput")
    expect(await stations.findAll()).toHaveLength(0)
  })

  it("trims what it is given, so a stray space is not part of the name", async () => {
    const { service } = build()

    const result = await service.register(command({ name: "  Riverside  " }))

    expect(isOk(result) && result.value.name).toBe("Riverside")
  })

  it("allows two stations to share a name", async () => {
    // Deliberate: a name is a label an operator may want to change, and a
    // uniqueness constraint here would make renaming one a migration.
    const { service } = build()

    await service.register(command())
    const second = await service.register(command())

    expect(isOk(second)).toBe(true)
  })
})
