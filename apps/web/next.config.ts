import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // Point Next.js to the monorepo root so workers can trace all workspace packages
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: [
    '@gumrukyz/db',
    '@gumrukyz/domain',
    '@gumrukyz/ai',
    '@gumrukyz/rules',
    '@gumrukyz/storage',
    '@gumrukyz/shared',
  ],
  serverExternalPackages: ['prisma', '@prisma/client', 'pdfjs-dist'],
  typescript: {
    ignoreBuildErrors: false,
  },
  // Resolve TypeScript-ESM .js → .ts extension aliases
  // (workspace packages use .js imports per TS ESM convention)
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
    }
    return config
  },
}

export default nextConfig
