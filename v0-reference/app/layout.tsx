import type React from "react"
import type { Metadata } from "next"
import { Manrope } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
})

export const metadata: Metadata = {
  title: "Apex - Enterprise SaaS Platform",
  description: "The modern platform for teams who ship fast. Built for scale, designed for speed.",
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${manrope.variable} font-sans antialiased`}
        style={{
          "--font-cal-sans": "var(--font-manrope)",
          "--font-instrument-sans": "var(--font-manrope)",
        } as React.CSSProperties}
      >
        <div className="noise-overlay" aria-hidden="true" />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
