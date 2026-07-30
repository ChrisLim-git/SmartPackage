"use client"

import { RiAlertLine } from "@remixicon/react"
import { useState } from "react"

import type { LockerDto, LockerSizeDto, StationDto } from "@dtos/master-data"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { useCreateLocker } from "@/hooks/use-create-locker"
import { useCreateStation } from "@/hooks/use-create-station"
import { useLockers } from "@/hooks/use-lockers"
import { useLockerSizes } from "@/hooks/use-locker-sizes"
import { useStations } from "@/hooks/use-stations"

import { CreateLockerDialog } from "./create-locker-dialog"
import { CreateStationDialog } from "./create-station-dialog"

/**
 * Radix reserves the empty string on a `SelectItem` for "clear the selection",
 * so "no filter" needs a name of its own rather than `""`.
 */
const ALL_STATIONS = "all"

/** One row per station and size, because "where am I short of large lockers" is a comparison. */
type CapacityRow = {
  stationId: string
  stationName: string
  sizeCode: string
  free: number
  total: number
}

const toCapacity = (
  stations: StationDto[],
  lockers: LockerDto[],
  sizes: LockerSizeDto[]
): CapacityRow[] =>
  stations.flatMap((station) =>
    sizes.map((size) => {
      const here = lockers.filter(
        (locker) =>
          locker.stationId === station.id && locker.size.code === size.code
      )

      return {
        stationId: station.id,
        stationName: station.name,
        sizeCode: size.code,
        free: here.filter((locker) => locker.status === "available").length,
        total: here.length,
      }
    })
  )

/** "lockers", "stations and lockers", "stations, locker sizes and lockers". */
const listOf = (items: string[]): string => {
  const sentenceCase = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1)

  if (items.length === 1) return sentenceCase(items[0])

  return sentenceCase(
    `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
  )
}

const LoadingRows = ({ columns }: { columns: number }) => (
  <>
    {[0, 1, 2].map((row) => (
      <TableRow key={row}>
        {Array.from({ length: columns }, (_, cell) => (
          <TableCell key={cell}>
            <Skeleton className="h-4 w-full" />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
)

export const LockerAdmin = () => {
  const [stationFilter, setStationFilter] = useState<string>(ALL_STATIONS)

  // Fetching lives in `hooks/`, so this component renders and nothing else.
  const stations = useStations()
  const sizes = useLockerSizes()
  const lockers = useLockers()
  const created = useCreateLocker()
  const createdStation = useCreateStation()

  const isLoading = stations.isLoading || sizes.isLoading || lockers.isLoading

  /**
   * Named individually rather than collapsed into "something went wrong".
   *
   * Each of these produces a different broken screen — no columns, no rows, no
   * station names — and an operator who is told which one failed knows whether
   * what they are looking at can be trusted.
   */
  const failures = [
    stations.isError && { label: "stations", retry: stations.refetch },
    sizes.isError && { label: "locker sizes", retry: sizes.refetch },
    lockers.isError && { label: "lockers", retry: lockers.refetch },
  ].filter((failure) => failure !== false)

  // The dialog's two dropdowns come from these. Opened without them it is a
  // form that cannot be completed and does not explain itself.
  const canAddLocker =
    (stations.data ?? []).length > 0 && (sizes.data ?? []).length > 0
  const capacity =
    stations.data && lockers.data && sizes.data
      ? toCapacity(stations.data, lockers.data, sizes.data)
      : []

  const visible = (lockers.data ?? []).filter(
    (locker) =>
      stationFilter === ALL_STATIONS || locker.stationId === stationFilter
  )
  const stationName = (id: string) =>
    stations.data?.find((station) => station.id === id)?.name ?? "—"

  return (
    <div className="flex flex-col gap-8">
      {failures.length > 0 && (
        // Above the tables, not below them: a message under a screen someone
        // has already read and believed has arrived too late.
        <div
          role="alert"
          className="flex items-start gap-3 border border-border bg-muted p-4"
        >
          <RiAlertLine className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="flex flex-col items-start gap-1">
            <p className="font-medium">
              {listOf(failures.map((failure) => failure.label))} could not be
              loaded.
            </p>
            <p className="text-[0.8125rem] text-muted-foreground">
              What is shown below is incomplete.
            </p>
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => failures.forEach((failure) => failure.retry())}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg">Capacity</h2>
          {/* Beside capacity rather than beside the locker list: a station is
              the thing a locker needs to exist first, so this is where an
              administrator looks when the table has nothing in it. */}
          <CreateStationDialog
            onCreate={(details) => createdStation.mutateAsync(details)}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Station</TableHead>
                {(sizes.data ?? []).map((size) => (
                  <TableHead key={size.code} className="text-right">
                    {size.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <LoadingRows columns={(sizes.data?.length ?? 3) + 1} />
              ) : (
                (stations.data ?? []).map((station) => (
                  <TableRow key={station.id}>
                    <TableCell className="font-medium">
                      {station.name}
                    </TableCell>
                    {(sizes.data ?? []).map((size) => {
                      const cell = capacity.find(
                        (row) =>
                          row.stationId === station.id &&
                          row.sizeCode === size.code
                      )

                      return (
                        <TableCell
                          key={size.code}
                          className="text-right font-mono tabular-nums"
                        >
                          {/* free of total, so a station with none left reads
                              as 0 / 3 rather than as an empty cell. */}
                          <span
                            className={
                              cell?.free === 0 && cell.total > 0
                                ? "text-destructive"
                                : undefined
                            }
                          >
                            {cell?.free ?? 0}
                          </span>
                          <span className="text-muted-foreground">
                            {" / "}
                            {cell?.total ?? 0}
                          </span>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg">Lockers</h2>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="station-filter">
              Filter by station
            </label>
            <Select value={stationFilter} onValueChange={setStationFilter}>
              <SelectTrigger id="station-filter" className="w-44">
                <SelectValue placeholder="All stations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATIONS}>All stations</SelectItem>
                {(stations.data ?? []).map((station) => (
                  <SelectItem key={station.id} value={station.id}>
                    {station.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Reachable only from `/admin`, which is guarded on the server;
                the API refuses a non-admin regardless, and that is the part
                that is security. */}
            <CreateLockerDialog
              stations={stations.data ?? []}
              sizes={sizes.data ?? []}
              disabled={!canAddLocker}
              onCreate={(details) => created.mutateAsync(details)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Station</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <LoadingRows columns={4} />
              ) : lockers.isError ? (
                // Not the empty state. "No lockers here" is a statement about
                // the estate, and a failed request knows nothing about it.
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    The locker list could not be loaded.
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No lockers at this station yet. Add one to start accepting
                    packages.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((locker) => (
                  <TableRow key={locker.id}>
                    <TableCell className="font-mono">{locker.label}</TableCell>
                    <TableCell>{stationName(locker.stationId)}</TableCell>
                    <TableCell>{locker.size.label}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          locker.status === "available"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {locker.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
