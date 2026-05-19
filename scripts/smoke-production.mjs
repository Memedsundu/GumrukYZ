#!/usr/bin/env node
/**
 * Production smoke checks for pilot launch.
 * Usage: pnpm smoke:production
 *        PRODUCTION_URL=https://gumrukyz.vercel.app pnpm smoke:production
 */

const baseUrl = process.env.PRODUCTION_URL ?? 'https://gumrukyz.vercel.app'

async function main() {
  const url = `${baseUrl.replace(/\/$/, '')}/api/health`
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
  console.log('\nManual E2E (per firm org):')
  console.log('  1. Clerk org invite → sign in')
  console.log('  2. Accept pilot consent')
  console.log('  3. New submission (REDACTED) → upload PDFs → validate → process → report')
  console.log('  4. Second org: dashboard must not show first org submissions')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
