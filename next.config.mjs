/** @type {import('next').NextConfig} */
const nextConfig = {
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
}

export default nextConfig
