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
  // pdfjs-dist must remain external because its worker is loaded via a separate URL.
  // All Prisma + Neon packages are pure-JS when using the Neon driver adapter, so
  // they are bundled by webpack to avoid pnpm symlink issues on Vercel.
  serverExternalPackages: ['pdfjs-dist'],
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
