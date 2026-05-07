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
  // Prisma + Neon packages must NOT be bundled — they're loaded from
  // node_modules at runtime. serverExternalPackages alone isn't enough
  // when the importer (@gumrukyz/db) is in transpilePackages; we also
  // add an explicit webpack externals regex.
  serverExternalPackages: [
    'prisma',
    '@prisma/client',
    '@prisma/adapter-neon',
    '@neondatabase/serverless',
    '.prisma/client',
    'pdfjs-dist',
  ],
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // Regex externals prevent bundling even when the importer is in
      // transpilePackages. The packages are traced + included in the
      // Lambda via serverExternalPackages above.
      const prismaRegex = /^(@prisma\/|\.prisma\/|@neondatabase\/)/
      if (Array.isArray(config.externals)) {
        config.externals.push(prismaRegex)
      } else {
        config.externals = [config.externals, prismaRegex].filter(Boolean)
      }
    }
    // Resolve TypeScript-ESM .js → .ts extension aliases
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
    }
    return config
  },
}

export default nextConfig
