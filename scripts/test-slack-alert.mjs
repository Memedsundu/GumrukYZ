#!/usr/bin/env node
/**
 * Send a test alert to Slack (or generic ALERT_WEBHOOK_URL).
 *
 * Setup: docs/slack-alerts-setup.md
 *   SLACK_WEBHOOK_URL=<paste-from-slack> in apps/web/.env.local
 *
 *   pnpm test:slack-alert
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const envPath = path.join(root, 'apps/web/.env.local')

if (!fs.existsSync(envPath)) {
  console.error('Missing apps/web/.env.local — add SLACK_WEBHOOK_URL first.')
  process.exit(1)
}

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const webhook = process.env.SLACK_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL
if (!webhook) {
  console.error(`
Missing SLACK_WEBHOOK_URL in apps/web/.env.local

See docs/slack-alerts-setup.md — create a Slack incoming webhook, then add:
  SLACK_WEBHOOK_URL=<paste-from-slack-incoming-webhooks>
`)
  process.exit(1)
}

const runner = `
import { sendTestAlert } from './src/lib/ready-alerts.ts'

const metrics = {
  queueDepth: 0,
  stuckJobs: 0,
  reconcilerBacklog: 0,
  providerRunsLastHour: 3,
  providerErrorsLastHour: 0,
  providerErrorRate: 0,
  providerP95DurationMs: 9000,
  globalSpendLastHourUsd: 0.04,
  dbLatencyMs: 45,
  thresholds: {
    maxQueueDepth: 50,
    maxStuckJobs: 5,
    maxReconcilerBacklog: 10,
    maxProviderErrorRate: 0.25,
    maxProviderP95DurationMs: 120000,
    maxGlobalSpendUsdPerHour: 500,
    maxDbLatencyMs: 500,
  },
  alerts: ['test_alert=webhook verification (safe to ignore)'],
  ready: false,
}

const ok = await sendTestAlert(metrics)
if (!ok) {
  console.error('Slack test alert FAILED')
  process.exit(1)
}
console.log('Slack test alert sent OK — check your Slack channel.')
`

const tmp = path.join(root, 'apps/web/.test-slack-alert.mjs')
fs.writeFileSync(tmp, runner)
try {
  execSync(`npx tsx ${JSON.stringify(tmp)}`, {
    cwd: path.join(root, 'apps/web'),
    stdio: 'inherit',
    env: process.env,
  })
} finally {
  fs.unlinkSync(tmp)
}
