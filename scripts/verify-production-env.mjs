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
]

const RECOMMENDED = [
  'TRIGGER_SECRET_KEY',
  'TRIGGER_PROJECT_ID',
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

if (failed) {
  console.error('\nMissing required variables. See docs/production-env-checklist.md')
  process.exit(1)
}

if (!present.has('TRIGGER_SECRET_KEY')) {
  console.warn('\nWARN: Set TRIGGER_SECRET_KEY before pilot — see docs/deploy-trigger.md')
}

console.log('\nDone.')
