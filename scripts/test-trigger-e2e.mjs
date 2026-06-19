#!/usr/bin/env node
/**
 * Production Trigger E2E: start async processing on a known-good submission and wait for completion.
 * Usage: node scripts/test-trigger-e2e.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const envPath = path.join(root, 'apps/web/.env.local')

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const submissionId = process.env.TEST_SUBMISSION_ID ?? '8f50fb46-2bc9-43a8-9b65-2e66ea69c1a5'
const tenantId = process.env.TEST_TENANT_ID ?? '60b11358-fc1d-4c6b-bef9-6a2985377549'

const runner = `
import { startSubmissionProcessing } from './src/lib/processing-runner.ts'
import { prisma } from '@gumrukyz/db'

async function main() {
  const submissionId = ${JSON.stringify(submissionId)}
  const tenantId = ${JSON.stringify(tenantId)}

  console.log('Trigger E2E: re-processing submission', submissionId)
  const result = await startSubmissionProcessing({ submissionId, tenantId })
  console.log('START', JSON.stringify(result, null, 2))
  if (!result.ok || !result.async || !result.triggerRunId) process.exit(2)

  const secret = process.env.TRIGGER_SECRET_KEY
  const terminalTrigger = new Set(['COMPLETED','FAILED','CANCELED','CRASHED','SYSTEM_FAILURE'])
  const terminalDb = new Set(['COMPLETED','FAILED'])

  for (let i = 0; i < 90; i++) {
    const runRes = await fetch('https://api.trigger.dev/api/v3/runs/' + result.triggerRunId, {
      headers: { Authorization: 'Bearer ' + secret },
    })
    const run = await runRes.json()
    const job = await prisma.processingJob.findUnique({
      where: { id: result.jobId },
      select: { status: true, currentStep: true, errorMessage: true, triggerJobId: true },
    })
    console.log(new Date().toISOString(), 'trigger=' + run.status, 'db=' + job?.status + '/' + job?.currentStep)
    if (job && terminalDb.has(job.status)) {
      console.log('FINAL trigger', JSON.stringify({ status: run.status, task: run.taskIdentifier, durationMs: run.durationMs }, null, 2))
      console.log('FINAL db', JSON.stringify(job, null, 2))
      if (run.status === 'COMPLETED' && job.status === 'COMPLETED') {
        console.log('E2E PASS')
        process.exit(0)
      }
      if (run.attempts) {
        for (const a of run.attempts) {
          if (a.status === 'FAILED') console.error('attempt error:', JSON.stringify(a.error))
        }
      }
      process.exit(1)
    }
    if (terminalTrigger.has(run.status) && (!job || !terminalDb.has(job.status))) {
      console.error('Trigger finished but DB job did not complete yet/failed')
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  console.error('E2E TIMEOUT')
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
`

const tmp = path.join(root, 'apps/web/.tmp-trigger-e2e.ts')
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
