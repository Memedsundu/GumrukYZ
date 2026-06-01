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
  for (const key of required) {
    if (body.checks?.[key] !== true) {
      console.error(`\nMissing required check: ${key}`)
      process.exit(1)
    }
  }

  if (body.checks?.trigger !== true) {
    console.warn('\nWARN: TRIGGER_SECRET_KEY not set on production — long jobs may timeout.')
  }

  console.log('\nHealth check OK')

  const betaUrl = `${root}/beta`
  console.log(`\nChecking ${betaUrl} ...`)
  const betaRes = await fetch(betaUrl, { signal: AbortSignal.timeout(15_000) })
  const betaHtml = await betaRes.text()
  if (!betaRes.ok || !betaHtml.includes('Beta kullanıma başla')) {
    console.error('\nBeta page smoke check FAILED')
    process.exit(1)
  }
  console.log('Beta page OK')

  console.log('\nManual E2E (per firm org):')
  console.log('  1. Open /beta → sign up by email')
  console.log('  2. Create/select firm → accept pilot consent')
  console.log('  3. New submission (REAL) → upload PDFs → validate → process → report')
  console.log('  4. Run optional expert AI review and confirm firm quota decreases')
  console.log('  5. Second firm: dashboard must not show first firm submissions')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
