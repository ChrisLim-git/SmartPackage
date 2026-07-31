import { unwrap } from "@/utils/unwrap"

import { Locker } from "../entities/locker"
import { isErr, isOk } from "../shared/result"
import { LockerSize, PackageSize } from "../utils/size"
import type { LockerFitService } from "./locker-fit-service"
import { OrdinalFitService } from "./ordinal-fit-service"
import { SmallestFitFirstService } from "./smallest-fit-first-service"

const lockerSize = (code: string, rank: number): LockerSize =>
  unwrap(LockerSize.create({ code, rank, label: `${code} locker` }))

const packageSize = (code: string, rank: number): PackageSize =>
  unwrap(PackageSize.create({ code, rank, label: `${code} package` }))

const S = lockerSize("S", 1)
const M = lockerSize("M", 2)
const L = lockerSize("L", 3)

const smallPackage = packageSize("S", 1)
const mediumPackage = packageSize("M", 2)
const largePackage = packageSize("L", 3)

const aLocker = (
  label: string,
  size: LockerSize,
  stationId = "station-1"
): Locker =>
  unwrap(Locker.create({ id: `locker-${label}`, stationId, size, label }))

const occupied = (locker: Locker): Locker =>
  unwrap(locker.occupy(`package-in-${locker.label}`))

describe("OrdinalFitService", () => {
  const fit = new OrdinalFitService()

  it("puts a small package in anything", () => {
    expect(fit.fits(S, smallPackage)).toBe(true)
    expect(fit.fits(M, smallPackage)).toBe(true)
    expect(fit.fits(L, smallPackage)).toBe(true)
  })

  it("refuses a locker smaller than the package", () => {
    expect(fit.fits(S, mediumPackage)).toBe(false)
    expect(fit.fits(M, largePackage)).toBe(false)
    expect(fit.fits(S, largePackage)).toBe(false)
  })

  it("counts an exact match as a fit — the boundary is inclusive", () => {
    expect(fit.fits(M, mediumPackage)).toBe(true)
    expect(fit.fits(L, largePackage)).toBe(true)
  })
})

describe("SmallestFitFirstService", () => {
  const select = new SmallestFitFirstService(new OrdinalFitService())

  it("prefers the smallest locker when everything is free", () => {
    const candidates = [aLocker("L1", L), aLocker("S1", S), aLocker("M1", M)]

    const chosen = select.select(candidates, smallPackage)

    expect(isOk(chosen)).toBe(true)
    if (isOk(chosen)) expect(chosen.value.label).toBe("S1")
  })

  it("takes the smallest that fits, not the exact size", () => {
    const candidates = [aLocker("L1", L), aLocker("M1", M)]

    const chosen = select.select(candidates, smallPackage)

    expect(isOk(chosen)).toBe(true)
    if (isOk(chosen)) expect(chosen.value.label).toBe("M1")
  })

  it("falls all the way up to the only locker left", () => {
    const chosen = select.select([aLocker("L1", L)], smallPackage)

    expect(isOk(chosen)).toBe(true)
    if (isOk(chosen)) expect(chosen.value.label).toBe("L1")
  })

  it("refuses when nothing is big enough", () => {
    const candidates = [aLocker("S1", S), aLocker("M1", M)]

    const chosen = select.select(candidates, largePackage)

    expect(isErr(chosen)).toBe(true)
    if (isErr(chosen)) {
      expect(chosen.error.code).toBe("NoSuitableLockerAvailable")
    }
  })

  it("refuses an empty station", () => {
    expect(isErr(select.select([], smallPackage))).toBe(true)
  })

  it("refuses when every locker that fits is occupied", () => {
    const candidates = [occupied(aLocker("S1", S)), occupied(aLocker("M1", M))]

    expect(isErr(select.select(candidates, smallPackage))).toBe(true)
  })

  it("skips an occupied locker in favour of a larger free one", () => {
    const candidates = [occupied(aLocker("S1", S)), aLocker("M1", M)]

    const chosen = select.select(candidates, smallPackage)

    expect(isOk(chosen)).toBe(true)
    if (isOk(chosen)) expect(chosen.value.label).toBe("M1")
  })

  it("breaks a tie by label, the same way every time", () => {
    const candidates = [aLocker("A3", S), aLocker("A1", S), aLocker("A2", S)]

    const first = select.select(candidates, smallPackage)
    const shuffled = select.select([...candidates].reverse(), smallPackage)

    expect(isOk(first)).toBe(true)
    if (isOk(first) && isOk(shuffled)) {
      expect(first.value.label).toBe("A1")
      expect(shuffled.value.label).toBe("A1")
    }
  })

  it("considers every candidate it is given, station or not", () => {
    // Scoping candidates is the caller's job; the service never learns stations exist.
    const candidates = [
      aLocker("B1", M, "station-2"),
      aLocker("A1", S, "station-1"),
    ]

    const chosen = select.select(candidates, smallPackage)

    expect(isOk(chosen)).toBe(true)
    if (isOk(chosen)) expect(chosen.value.stationId).toBe("station-1")
  })

  it("genuinely defers to the fit service it was given", () => {
    const nothingFits: LockerFitService = { fits: () => false }
    const fussy = new SmallestFitFirstService(nothingFits)

    expect(isErr(fussy.select([aLocker("L1", L)], smallPackage))).toBe(true)
  })

  it("does not mutate the candidate list it was handed", () => {
    const candidates = [aLocker("A2", S), aLocker("A1", S)]
    const order = candidates.map((locker) => locker.label)

    select.select(candidates, smallPackage)

    expect(candidates.map((locker) => locker.label)).toEqual(order)
  })
})
