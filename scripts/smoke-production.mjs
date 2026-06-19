#!/usr/bin/env node
/**
 * Production smoke checks for pilot launch.
 * Usage: pnpm smoke:production
 *        PRODUCTION_URL=https://gumrukyz.vercel.app pnpm smoke:production
 */

const baseUrl = process.env.PRODUCTION_URL ?? 'https://gumrukyz.vercel.app'

async function main() {
  const root = baseUrl.replace(/\/$/, '')
  const url = `${root}/api/health`
  console.log(`Checking ${url} ...`)

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    console.error('Non-JSON response (deploy /api/health first):', text.slice(0, 200))
    process.exit(1)
  }

  console.log(JSON.stringify(body, null, 2))

  if (!res.ok || !body.ok) {
    console.error('\nHealth check FAILED')
    process.exit(1)
  }

  const required = ['database', 'clerk']
  if (body.strict === true) {
    required.push('blob', 'openai', 'trigger')
  }

  for (const key of required) {
    if (body.checks?.[key] !== true) {
      console.error(`\nMissing required check: ${key}`)
      process.exit(1)
    }
  }

  if (body.strict !== true) {
    console.warn('\nWARN: HEALTH_STRICT is not enabled — production should set HEALTH_STRICT=true')
    if (body.checks?.trigger !== true) {
      console.warn('WARN: TRIGGER_SECRET_KEY not set on production — long jobs may timeout.')
    }
  }

  console.log('\nHealth check OK')

  if (body.scalability) {
    const s = body.scalability
    if (!s.distributedRateLimit) {
      console.warn('\nWARN: Distributed rate limit inactive — set UPSTASH_REDIS_REST_* on production')
    } else if (s.rateLimitRedisOk !== true) {
      console.warn('\nWARN: Upstash Redis ping failed — check UPSTASH credentials')
    }
    if (!s.spendGuard) {
      console.warn('\nWARN: Spend circuit breaker inactive — set SPEND_CIRCUIT_BREAKER_ENABLED=true')
    }
  }

  const readyUrl = `${root}/api/ready`
  console.log(`\nChecking ${readyUrl} ...`)
  const readyRes = await fetch(readyUrl, { signal: AbortSignal.timeout(20_000) })
  const readyBody = await readyRes.json().catch(() => null)
  if (readyBody) {
    console.log(JSON.stringify(readyBody, null, 2))
  }
  if (!readyRes.ok || readyBody?.ready !== true) {
    console.warn('\nWARN: Readiness check not OK (queue/provider saturation — see alerts)')
  } else {
    console.log('\nReadiness check OK')
  }

  const homeUrl = `${root}/`
  console.log(`\nChecking ${homeUrl} ...`)
  const homeRes = await fetch(homeUrl, { signal: AbortSignal.timeout(15_000), redirect: 'follow' })
  const homeHtml = await homeRes.text()
  if (!homeRes.ok || !homeHtml.includes('Gümrük risklerini beyan öncesi dengeleyin')) {
    console.error('\nHomepage smoke check FAILED')
    process.exit(1)
  }
  console.log('Homepage OK')

  console.log('\nManual E2E (per firm org):')
  console.log('  1. Open / → sign up by email')
  console.log('  2. Create/select firm → accept pilot consent')
  console.log('  3. New submission (REAL) → upload PDFs → validate → process → report')
  console.log('  4. Run optional expert AI review and confirm firm quota decreases')
  console.log('  5. Second firm: dashboard must not show first firm submissions')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
