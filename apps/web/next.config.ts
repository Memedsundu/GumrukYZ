import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // Point Next.js file-tracing at the monorepo root so workspace packages
  // and their node_modules are discoverable.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: [
    '@gumrukyz/db',
    '@gumrukyz/domain',
    '@gumrukyz/ai',
    '@gumrukyz/rules',
    '@gumrukyz/storage',
    '@gumrukyz/shared',
  ],
  // All packages are bundled — no pnpm-symlinked externals that could break Vercel.
  serverExternalPackages: [],
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack(config) {
    // Resolve TypeScript-ESM .js → .ts extension aliases
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
    }
    return config
  },
}

export default nextConfig
