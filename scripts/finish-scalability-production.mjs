#!/usr/bin/env node
/**
 * Activate scalability Waves 1–4 on Vercel production.
 *
 * Prerequisites in apps/web/.env.local:
 *   - TRIGGER_SECRET_KEY, TRIGGER_PROJECT_ID (Wave 2)
 *   - UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (Wave 4 — optional but recommended)
 *
 * Run from repo root:
 *   node scripts/finish-scalability-production.mjs
 *
 * Steps:
 *   1. Push Wave 4 + recommended env vars to Vercel production
 *   2. Deploy Trigger.dev tasks
 *   3. Redeploy Vercel production
 *   4. Smoke test + load-test readiness baseline
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const envPath = path.join(root, 'apps/web/.env.local')
const webDir = path.join(root, 'apps/web')

const DEFAULTS = {
  SPEND_CIRCUIT_BREAKER_ENABLED: 'true',
  SPEND_LIMIT_TENANT_USD_PER_HOUR: '25',
  SPEND_LIMIT_GLOBAL_USD_PER_HOUR: '500',
  OPENAI_PROVIDER_MAX_CONCURRENCY: '5',
  AZURE_PROVIDER_MAX_CONCURRENCY: '3',
  PROVIDER_RETRY_MAX_ATTEMPTS: '4',
  PROVIDER_RETRY_BASE_MS: '1000',
  TRIGGER_GLOBAL_CONCURRENCY: '15',
  TRIGGER_TENANT_CONCURRENCY: '2',
  TRIGGER_CLASSIFICATION_CONCURRENCY: '10',
  TRIGGER_EXPERT_REVIEW_CONCURRENCY: '5',
  READY_MAX_QUEUE_DEPTH: '50',
  READY_MAX_STUCK_JOBS: '5',
  READY_MAX_RECONCILER_BACKLOG: '10',
  READY_MAX_PROVIDER_ERROR_RATE: '0.25',
  READY_MAX_PROVIDER_P95_MS: '120000',
  READY_MAX_DB_LATENCY_MS: '500',
}

const OPTIONAL_FROM_LOCAL = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'ALERT_WEBHOOK_URL',
  'CRON_SECRET',
]

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const env = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

function run(cmd, cwd = root) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function addVercelEnv(key, value, environment = 'production') {
  execSync(`vercel env add ${key} ${environment} --value ${JSON.stringify(value)} --yes --force`, {
    cwd: webDir,
    stdio: ['pipe', 'pipe', 'inherit'],
  })
}

const env = parseEnvFile(envPath)

if (!env.TRIGGER_SECRET_KEY || !env.TRIGGER_PROJECT_ID) {
  console.error(`
Missing Trigger.dev keys in apps/web/.env.local

Run Wave 0 setup first: node scripts/finish-wave0-production.mjs
Or add TRIGGER_SECRET_KEY and TRIGGER_PROJECT_ID manually.
`)
  process.exit(1)
}

const hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)

if (!hasUpstash) {
  console.warn(`
WARN: Upstash Redis not found in apps/web/.env.local

Wave 4 distributed rate limits will fall back to per-instance memory until you add:
  UPSTASH_REDIS_REST_URL=https://....upstash.io
  UPSTASH_REDIS_REST_TOKEN=...

Create a free database:
  1. https://console.upstash.com/redis → Create database (region: eu-central-1 or closest)
  2. Copy REST URL + REST TOKEN into apps/web/.env.local
  3. Re-run this script

Or use Vercel integration: https://vercel.com/integrations/upstash
`)
}

console.log('Pushing scalability env vars to Vercel production…')

const toPush = { ...DEFAULTS }
for (const key of OPTIONAL_FROM_LOCAL) {
  if (env[key]) toPush[key] = env[key]
}
toPush.TRIGGER_SECRET_KEY = env.TRIGGER_SECRET_KEY
toPush.TRIGGER_PROJECT_ID = env.TRIGGER_PROJECT_ID
toPush.HEALTH_STRICT = 'true'

for (const [key, value] of Object.entries(toPush)) {
  console.log(`  → ${key}`)
  addVercelEnv(key, value)
}

console.log('\nDeploying Trigger.dev tasks…')
run('pnpm trigger:deploy', webDir)

console.log('\nRedeploying Vercel production…')
run('vercel deploy --prod -y', webDir)

console.log('\nRunning smoke test…')
run('pnpm smoke:production', root)

console.log('\nRunning load-test readiness baseline (stage 50)…')
run('node scripts/load-test-readiness.mjs --stage 50', root)

console.log(`
Done.

Next manual checks:
  • curl ${process.env.PRODUCTION_URL ?? 'https://gumrukyz.vercel.app'}/api/health — rateLimitRedis should be true when Upstash is set
  • curl .../api/ready — scalability.spendGuard should be true
  • Run E2E: node scripts/test-trigger-e2e.mjs

Load test ladder (after pilot traffic is stable):
  node scripts/load-test-readiness.mjs --stage 100
  node scripts/load-test-readiness.mjs --stage 250
`)
