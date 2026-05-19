import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
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
  outputFileTracingIncludes: {
    '/*': [
      '../../node_modules/.pnpm/@prisma+client@6.19.3*/node_modules/.prisma/client/query_compiler_bg.wasm',
      '../../node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    ],
  },
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
