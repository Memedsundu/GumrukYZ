import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // Point Next.js to the monorepo root so workers can trace all workspace packages
  outputFileTracingRoot: path.join(__dirname, '../../'),
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff',
      './node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff',
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    ],
  },
  transpilePackages: [
    '@gumrukyz/db',
    '@gumrukyz/domain',
    '@gumrukyz/ai',
    '@gumrukyz/rules',
    '@gumrukyz/storage',
    '@gumrukyz/shared',
  ],
  // Keep Prisma + Neon loaded from node_modules at runtime so Vercel can
  // trace and package their generated/runtime files correctly.
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
