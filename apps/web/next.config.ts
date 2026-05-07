import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@gumrukyz/db',
    '@gumrukyz/domain',
    '@gumrukyz/ai',
    '@gumrukyz/rules',
    '@gumrukyz/storage',
    '@gumrukyz/shared',
  ],
  serverExternalPackages: ['prisma', '@prisma/client', 'pdfjs-dist'],
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig
