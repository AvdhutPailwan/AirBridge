import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
  // Next.js 15 dev server recommends this at the root to allow mobile IP access
  allowedDevOrigins: ["192.168.23.31", "localhost"],
}

export default nextConfig
