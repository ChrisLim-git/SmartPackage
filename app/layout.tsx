import type { Metadata, Viewport } from "next"
import { Geist, JetBrains_Mono, Merriweather } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { QueryProvider } from "@/components/query-provider"
import { SessionBar } from "@/components/session-bar"

export const metadata: Metadata = {
  title: "Smart Package Locker",
  description: "Store and collect parcels from smart lockers.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

// Named for the CSS variable each one feeds, so the slot is obvious at the call
// site below. Note the preset makes mono the *body* font — see DESIGN.md.
const headingFont = Merriweather({
  subsets: ["latin"],
  variable: "--font-heading",
})

const sansFont = Geist({ subsets: ["latin"], variable: "--font-sans" })

const monoFont = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        sansFont.variable,
        monoFont.variable,
        headingFont.variable
      )}
    >
      <body>
        <ThemeProvider>
          <QueryProvider>
            {/* `min-h-svh` here, not on the page: on the page it measures from
                under the bar and overflows by exactly the bar's height. */}
            <div className="flex min-h-svh flex-col">
              <SessionBar />
              {children}
            </div>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
