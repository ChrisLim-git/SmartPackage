"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Theme follows the operating system.
 *
 * DESIGN.md argues the field scene — bright mall lighting, a phone held at arm's
 * length — points at light, and it also says that if dark ships, the field
 * surfaces have to be contrast-checked under that assumption rather than assumed
 * fine. That check has now been done and both modes are measured against WCAG:
 * see the token comments in `app/globals.css`. So honouring the system setting is
 * a real choice rather than an untested default.
 *
 * There was a global `d` keypress here that toggled the theme. It is gone. It was
 * bound on `window` and fired for any keystroke outside a text field, which meant
 * a screen-reader user in browse mode — where every letter is a navigation
 * command — flipped the app's colour scheme by reading it. Nothing advertised the
 * shortcut, so nobody was relying on it, and a theme toggle nobody can find is
 * not worth a hazard for the people who can't avoid it.
 */
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
