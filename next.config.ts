import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["puppeteer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Aumentar timeout para server components que fazem fetch externo
  staticPageGenerationTimeout: 120,
};

export default nextConfig;
