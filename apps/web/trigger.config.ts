import { defineConfig } from '@trigger.dev/sdk'
import { additionalFiles, syncEnvVars } from '@trigger.dev/build/extensions/core'
import { prismaExtension } from '@trigger.dev/build/extensions/prisma'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function loadEnvFile(filename: string): Record<string, string> {
  const filePath = path.join(process.cwd(), filename)
  if (!existsSync(filePath)) return {}
  const env: Record<string, string> = {}
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  return env
}

function varsForTriggerWorkers(all: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}

  const directDbUrl = all.DATABASE_URL_UNPOOLED || all.DATABASE_URL
  if (directDbUrl) {
    let url = directDbUrl
      .replace(/&?channel_binding=require/g, '')
      .replace(/connection_limit=\d+/g, '')
      .replace(/[?&]$/, '')
    url += `${url.includes('?') ? '&' : '?'}connection_limit=5`
    out.DATABASE_URL = url
  }

  for (const [key, value] of Object.entries(all)) {
    if (!value) continue
    if (key.startsWith('TRIGGER_') || key.startsWith('NEXT_PUBLIC_') || key === 'CRON_SECRET') continue
    if (key.startsWith('OCR_') || key.startsWith('INTERNAL_') || key.startsWith('PLATFORM_')) continue
    if (key === 'DATABASE_URL' || key === 'DATABASE_URL_UNPOOLED') continue
    if (
      key.startsWith('OPENAI_') ||
      key.startsWith('BLOB_') ||
      key.startsWith('DOCUMENT_') ||
      key.startsWith('AZURE_')
    ) {
      out[key] = value
    }
  }

  return out
}

export default defineConfig({
  project: process.env['TRIGGER_PROJECT_ID'] ?? 'proj_nwvnvcvwwrfrtjapfjhg',
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 300, // 5 minutes max per job
  dirs: ['./src/trigger'],
  build: {
    extensions: [
      prismaExtension({
        mode: 'legacy',
        schema: '../../packages/db/prisma/schema.prisma',
        clientGenerator: 'client',
        version: '6.19.3',
      }),
      additionalFiles({
        files: [
          '../../node_modules/.pnpm/**/node_modules/.prisma/client/*.wasm',
          '../../node_modules/.pnpm/**/node_modules/.prisma/client/**/*.wasm',
        ],
      }),
      syncEnvVars(async () => {
        const merged = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') }
        return varsForTriggerWorkers(merged)
      }),
    ],
  },
})
