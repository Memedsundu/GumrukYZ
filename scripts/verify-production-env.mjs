#!/usr/bin/env node
/**
 * Prints production env checklist (from Vercel CLI when linked).
 * Usage: pnpm verify:production-env
 */

import { execSync } from 'node:child_process'

const REQUIRED = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'OPENAI_API_KEY',
  'CRON_SECRET',
  'HEALTH_STRICT',
  'TRIGGER_SECRET_KEY',
  'TRIGGER_PROJECT_ID',
]

const RECOMMENDED = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SPEND_CIRCUIT_BREAKER_ENABLED',
  'SPEND_LIMIT_TENANT_USD_PER_HOUR',
  'SPEND_LIMIT_GLOBAL_USD_PER_HOUR',
  'ALERT_WEBHOOK_URL',
  'OPENAI_PROVIDER_MAX_CONCURRENCY',
  'AZURE_PROVIDER_MAX_CONCURRENCY',
  'TRIGGER_GLOBAL_CONCURRENCY',
  'TRIGGER_TENANT_CONCURRENCY',
  'OCR_SERVICE_URL',
  'OCR_SERVICE_SECRET',
  'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT',
  'AZURE_DOCUMENT_INTELLIGENCE_KEY',
  'DOCUMENT_READER_MODE',
  'INTERNAL_TENANT_CLERK_ORG_ID',
]

function listEnv() {
  try {
    const out = execSync('vercel env ls production', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    return out
  } catch {
    return ''
  }
}

const listing = listEnv()
const present = new Set(
  listing
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean),
)

console.log('Production env verification (Vercel project: gumrukyz)\n')

let failed = false
for (const key of REQUIRED) {
  const ok = present.has(key)
  console.log(`${ok ? '✓' : '✗'} ${key} (required)`)
  if (!ok) failed = true
}

console.log('')
for (const key of RECOMMENDED) {
  const ok = present.has(key)
  console.log(`${ok ? '✓' : '○'} ${key} (recommended)`)
}

if (present.has('DATABASE_URL')) {
  console.log('\nManual DATABASE_URL checks (Neon dashboard / Vercel env editor):')
  console.log('  • hostname contains -pooler.')
  console.log('  • query string includes connection_limit=1')
}

if (!present.has('UPSTASH_REDIS_REST_URL')) {
  console.warn('\nWARN: No Upstash — distributed rate limits use per-instance memory only.')
  console.warn('      See docs/finish-scalability-setup.md')
}

if (!present.has('SPEND_CIRCUIT_BREAKER_ENABLED')) {
  console.warn('\nWARN: SPEND_CIRCUIT_BREAKER_ENABLED not set — hourly AI spend is not capped.')
}

if (failed) {
  console.error('\nMissing required variables. See docs/production-env-checklist.md')
  process.exit(1)
}

console.log('\nDone.')
console.log('Activate all waves: node scripts/finish-scalability-production.mjs')
