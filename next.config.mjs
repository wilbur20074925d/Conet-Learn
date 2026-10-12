/** @type {import('next').NextConfig} */
import fs from "node:fs"
import path from "node:path"

// One stamp per build. Next may load this file more than once; reuse a recent stamp.
const stampPath = path.join(process.cwd(), ".app-version")
function readRecentStamp() {
  try {
    const stat = fs.statSync(stampPath)
    if (Date.now() - stat.mtimeMs > 3 * 60 * 1000) return ""
    return fs.readFileSync(stampPath, "utf8").trim()
  } catch {
    return ""
  }
}
const appVersion = readRecentStamp() || `${Date.now()}`
try {
  fs.writeFileSync(stampPath, appVersion)
} catch {
  // Version still inlines for this process even if the stamp file cannot be written.
}

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Hide the Next.js N logo / dev indicator
  devIndicators: false,
  // Suppress Compiling/Compiled and request logs in the terminal
  logging: false,
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
    ]
    return [
      { source: "/version.json", headers: noStore },
      { source: "/", headers: noStore },
      { source: "/login", headers: noStore },
      { source: "/in-class-session", headers: noStore },
      { source: "/consent-form", headers: noStore },
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              source: "/_next/static/:path*",
              headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
            },
          ]
        : [
            {
              source: "/_next/static/:path*",
              headers: noStore,
            },
          ]),
    ]
  },
}

export default nextConfig
