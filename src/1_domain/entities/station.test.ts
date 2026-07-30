import { isErr, isOk } from "../shared/result"
import { Station } from "./station"

const attributes = {
  id: "station-1",
  name: "Central Mall",
  address: "180 Bourke Street, Melbourne",
}

describe("Station", () => {
  it("trims what it is given", () => {
    const station = Station.create({
      ...attributes,
      name: "  Central Mall  ",
      address: "  180 Bourke Street  ",
    })

    expect(isOk(station) && station.value.name).toBe("Central Mall")
    expect(isOk(station) && station.value.address).toBe("180 Bourke Street")
  })

  it("refuses a station nobody could find", () => {
    expect(isErr(Station.create({ ...attributes, address: "   " }))).toBe(true)
    expect(isErr(Station.create({ ...attributes, name: "" }))).toBe(true)
  })
})
