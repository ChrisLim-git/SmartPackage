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
    //
    // `min-h-svh` and a flex child that grows, so the form's submit sits at the
    // bottom of the viewport rather than wherever the fields happen to end.
    // DESIGN.md asks for a bottom-anchored primary action on both field surfaces
    // and only the sign-in page was doing it.
    //
    // The heading lives inside the form component rather than here: on success
    // the result has to *replace* the page title, not appear underneath it, and
    // a server component cannot know which of the two states is showing.
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col p-6">
      <StorePackageForm
        stations={sites.map(toStationDto)}
        sizes={sizes.map(toLockerSizeDto)}
        agentEmail={gate.value.user.email}
      />
    </main>
  )
}
