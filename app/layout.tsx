import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import AppUpdateWatcher from "@/components/app-update-watcher"
import "./globals.css"

export const metadata: Metadata = {
  title: "CoNetLearn",
  description: "A seminar space for collaborative argumentation with NATE.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body className={`${GeistSans.className} font-sans antialiased`}>
        <AppUpdateWatcher />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
