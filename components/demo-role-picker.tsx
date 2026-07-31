"use client"

import { RiFlaskLine } from "@remixicon/react"

import { DEMO_ACCOUNTS } from "@/lib/demo-mode"
import { Button } from "@/components/ui/button"

/**
 * One tap to sign in as either seeded role. Dashed border marks it as test
 * scaffolding rather than product.
 */
export const DemoRolePicker = ({
  onPick,
  busyRole,
  disabled,
}: {
  onPick: (email: string) => void
  busyRole: string | null
  disabled: boolean
}) => (
  <section
    aria-labelledby="demoRolePickerHeading"
    className="flex flex-col gap-3 border border-dashed border-field-border p-4"
  >
    <div className="flex items-start gap-2">
      <RiFlaskLine
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <h2 id="demoRolePickerHeading" className="text-label font-medium">
        Demo mode — sign in as a test account
      </h2>
    </div>

    <div className="flex flex-col gap-2">
      {DEMO_ACCOUNTS.map((account) => (
        // `whitespace-normal` and `h-auto` override the button base, which is
        // nowrap at a fixed height and clips a two-line label.
        <Button
          key={account.role}
          type="button"
          variant="outline"
          className="h-auto w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-base whitespace-normal"
          disabled={disabled}
          onClick={() => onPick(account.email)}
        >
          <span className="font-medium">
            {busyRole === account.role
              ? `Signing in as ${account.role}…`
              : `Continue as ${account.role}`}
          </span>
          <span className="text-label font-normal text-muted-foreground">
            {account.description}
          </span>
        </Button>
      ))}
    </div>
  </section>
)
