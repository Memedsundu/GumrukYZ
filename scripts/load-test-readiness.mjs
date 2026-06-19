#!/usr/bin/env node
/**
 * Lightweight readiness load test — hits public /api/health and /api/ready.
 *
 * Usage:
 *   node scripts/load-test-readiness.mjs
 *   node scripts/load-test-readiness.mjs --stage 100
 *   PRODUCTION_URL=https://gumrukyz.vercel.app node scripts/load-test-readiness.mjs --stage 250
 *
 * Stages (concurrent requests per endpoint): 10 → 50 → 100 → 250
 * Watch dbLatencyMs and provider metrics in /api/ready between stages.
 */

const baseUrl = (process.env.PRODUCTION_URL ?? 'https://gumrukyz.vercel.app').replace(/\/$/, '')

const STAGES = [10, 50, 100, 250]

function parseStageArg() {
  const idx = process.argv.indexOf('--stage')
  if (idx === -1) return STAGES
  const value = Number(process.argv[idx + 1])
  if (!Number.isFinite(value) || value <= 0) {
    console.error('Invalid --stage value')
    process.exit(1)
  }
  return [value]
}

async function fetchTimed(path) {
  const started = Date.now()
  try {
    const res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(30_000) })
    const ms = Date.now() - started
    return { ok: res.ok, status: res.status, ms }
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - started, error: err instanceof Error ? err.message : 'error' }
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)]
}

async function runStage(concurrency, path) {
  const results = await Promise.all(
    Array.from({ length: concurrency }, () => fetchTimed(path)),
  )
  const latencies = results.map((r) => r.ms)
  const errors = results.filter((r) => !r.ok).length
  return {
    path,
    concurrency,
    errors,
    errorRate: errors / concurrency,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    max: Math.max(...latencies),
  }
}

async function fetchReadySnapshot() {
  try {
    const res = await fetch(`${baseUrl}/api/ready`, { signal: AbortSignal.timeout(30_000) })
    return await res.json()
  } catch {
    return null
  }
}

async function main() {
  const stages = parseStageArg()
  console.log(`Load-test readiness against ${baseUrl}\n`)

  const before = await fetchReadySnapshot()
  if (before?.metrics) {
    console.log('Before:', {
      queueDepth: before.metrics.queueDepth,
      dbLatencyMs: before.metrics.dbLatencyMs,
      providerErrorRate: before.metrics.providerErrorRate,
      globalSpendLastHourUsd: before.metrics.globalSpendLastHourUsd ?? null,
      scalability: before.scalability ?? null,
    })
  }

  let failed = false
  for (const stage of stages) {
    console.log(`\n--- Stage ${stage} concurrent ---`)
    for (const path of ['/api/health', '/api/ready']) {
      const result = await runStage(stage, path)
      console.log(JSON.stringify(result))
      if (result.errorRate > 0.05) {
        console.error(`FAIL: ${path} error rate ${(result.errorRate * 100).toFixed(1)}% > 5%`)
        failed = true
      }
      if (result.p95 > 3000) {
        console.warn(`WARN: ${path} p95 ${result.p95}ms > 3000ms — investigate before next stage`)
      }
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  const after = await fetchReadySnapshot()
  if (after?.metrics) {
    console.log('\nAfter:', {
      queueDepth: after.metrics.queueDepth,
      dbLatencyMs: after.metrics.dbLatencyMs,
      providerErrorRate: after.metrics.providerErrorRate,
      alerts: after.alerts ?? [],
    })
  }

  if (failed) {
    console.error('\nLoad test FAILED — fix errors before scaling further.')
    process.exit(1)
  }

  console.log('\nLoad test OK for this stage.')
  const next = STAGES.find((s) => s > stages[stages.length - 1])
  if (next) {
    console.log(`Next: node scripts/load-test-readiness.mjs --stage ${next}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
