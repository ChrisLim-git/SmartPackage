"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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

import { CreateLockerDialog } from "./create-locker-dialog"

/**
 * Radix reserves the empty string on a `SelectItem` for "clear the selection",
 * so "no filter" needs a name of its own rather than `""`.
 */
const ALL_STATIONS = "all"

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`)
  }

  return response.json()
}

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
  const queries = useQueryClient()
  const [stationFilter, setStationFilter] = useState<string>(ALL_STATIONS)

  const stations = useQuery({
    queryKey: ["stations"],
    queryFn: () => fetchJson<StationDto[]>("/api/stations"),
  })
  const sizes = useQuery({
    queryKey: ["locker-sizes"],
    queryFn: () => fetchJson<LockerSizeDto[]>("/api/locker-sizes"),
  })
  const lockers = useQuery({
    queryKey: ["lockers"],
    queryFn: () => fetchJson<LockerDto[]>("/api/lockers"),
  })

  const created = useMutation({
    mutationFn: async (details: {
      stationId: string
      sizeCode: string
      label: string
    }) => {
      const response = await fetch("/api/lockers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(details),
      })

      if (!response.ok) {
        // The message the API wrote, carried up so the dialog can put it
        // against the field it belongs to.
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.message ?? `The server answered ${response.status}.`
        )
      }

      return response.json() as Promise<LockerDto>
    },
    // The new locker appears without anyone reaching for refresh.
    onSuccess: () => queries.invalidateQueries({ queryKey: ["lockers"] }),
  })

  const isLoading = stations.isLoading || sizes.isLoading || lockers.isLoading
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
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg">Capacity</h2>
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

      {lockers.isError && (
        <p role="alert" className="text-sm text-destructive">
          The locker list could not be loaded.{" "}
          <Button variant="link" onClick={() => lockers.refetch()}>
            Try again
          </Button>
        </p>
      )}
    </div>
  )
}
