import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { toLockerSizeDto, toStationDto } from "@dtos/master-data"
import { isErr } from "@domain/shared/result"
import { guards, lockerSizes, stations } from "@infrastructure/container"

import { StorePackageForm } from "@/components/store-package-form"

/**
 * Where an agent lands after signing in.
 *
 * The station list and the size ladder are read here rather than fetched by the
 * form: this page is already a server component with the composition root in
 * reach, and two round trips before an agent can type anything is two round
 * trips on a phone at a locker wall.
 */
export default async function StorePackagePage() {
  const gate = await guards.requireRole(await headers(), "agent")

  if (isErr(gate)) redirect("/sign-in")

  const [sites, sizes] = await Promise.all([
    stations.findAll(),
    lockerSizes.findAll(),
  ])

  return (
    // 375px-first, like every agent surface: single column, thumb reach.
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl">Store a package</h1>
        <p className="text-[0.8125rem] text-muted-foreground">
          {gate.value.user.email}
        </p>
      </div>

      <StorePackageForm
        stations={sites.map(toStationDto)}
        sizes={sizes.map(toLockerSizeDto)}
      />
    </main>
  )
}
