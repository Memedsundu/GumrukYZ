#!/usr/bin/env node
/**
 * Finish Wave 0 production setup after Trigger.dev keys exist locally.
 *
 * Prerequisites (one-time, in browser):
 *   1. https://cloud.trigger.dev → New project "GumrukYZ"
 *   2. Copy Project ID → TRIGGER_PROJECT_ID in apps/web/.env.local
 *   3. Project → API Keys → PROD secret key → TRIGGER_SECRET_KEY in .env.local
 *   4. cd apps/web && npx trigger.dev@latest login
 *
 * Then run from repo root:
 *   node scripts/finish-wave0-production.mjs
 *
 * This script:
 *   - Pushes TRIGGER_* + HEALTH_STRICT=true to Vercel production
 *   - Deploys Trigger.dev tasks
 *   - Redeploys Vercel production
 *   - Runs smoke test
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const envPath = path.join(root, 'apps/web/.env.local')
const webDir = path.join(root, 'apps/web')

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
const triggerSecret = env.TRIGGER_SECRET_KEY
const triggerProjectId = env.TRIGGER_PROJECT_ID

if (!triggerSecret || !triggerProjectId) {
  console.error(`
Missing Trigger.dev keys in apps/web/.env.local

Do this first (5 minutes):
  1. Open https://cloud.trigger.dev and sign in
  2. New project → name: GumrukYZ
  3. Settings → copy "Project ref" (starts with proj_)
     Add to .env.local: TRIGGER_PROJECT_ID=proj_...
  4. API Keys → PROD → copy secret key
     Add to .env.local: TRIGGER_SECRET_KEY=tr_prod_...
  5. Login CLI: cd apps/web && npx trigger.dev@latest login

Then re-run: node scripts/finish-wave0-production.mjs
`)
  process.exit(1)
}

console.log('Pushing Trigger.dev + HEALTH_STRICT to Vercel production…')
addVercelEnv('TRIGGER_SECRET_KEY', triggerSecret)
addVercelEnv('TRIGGER_PROJECT_ID', triggerProjectId)
addVercelEnv('HEALTH_STRICT', 'true')

console.log('\nDeploying Trigger.dev tasks…')
run('npx trigger.dev@latest deploy', webDir)

console.log('\nRedeploying Vercel production…')
run('vercel deploy --prod -y', webDir)

console.log('\nRunning smoke test…')
run('pnpm smoke:production', root)

console.log('\nDone. Verify processing returns HTTP 202 on a test submission.')
