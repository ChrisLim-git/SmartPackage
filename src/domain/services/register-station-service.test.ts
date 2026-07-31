import { RegisterStationService } from "@domain/services/register-station-service"
import { isErr, isOk } from "@domain/shared/result"

import { InMemoryStationRepository } from "@/utils/in-memory-repositories"

/** Asserts validation runs before the write, and that a name is not an identity. */

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
    const { service } = build()

    await service.register(command())
    const second = await service.register(command())

    expect(isOk(second)).toBe(true)
  })
})
