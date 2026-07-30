import { RiAlertLine } from "@remixicon/react"

/**
 * What a form says when the request came back refused.
 *
 * Calm rather than alarming, and identical on both field surfaces: a full station
 * and an unrecognised code are ordinary answers to reasonable requests, and the
 * person's next move is a different size or a second look at the digits.
 *
 * `role="alert"` so it is announced when it appears — a message that only exists
 * visually is a message a screen-reader user never receives.
 */
export const FormAlert = ({
  message,
  advice,
}: {
  message: string
  advice: string
}) => (
  <div
    role="alert"
    className="flex items-start gap-3 border border-border bg-muted p-4"
  >
    <RiAlertLine className="mt-0.5 size-5 shrink-0" aria-hidden />
    <div className="flex flex-col gap-1">
      <p className="font-medium">{message}</p>
      <p className="text-[0.8125rem] text-muted-foreground">{advice}</p>
    </div>
  </div>
)
