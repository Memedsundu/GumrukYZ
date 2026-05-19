/**
 * Fixture runner — validates that all rules produce expected results
 * against the fixture data sets.
 *
 * Run with: pnpm --filter @gumrukyz/rules test:fixtures
 */
import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { RuleEvaluator } from './evaluator.js'
import { ALL_RULES, LOW_CONFIDENCE_THRESHOLD } from './index.js'
import type { SubmissionContext, ExtractionData } from './types.js'
import type { DocumentType, TradeFlow } from '@gumrukyz/domain'

interface FixtureFile {
  _fixture: string
  _description: string
  _tradeFlow: TradeFlow
  _expectedResults: Record<string, string | null>
  _assertNoFailures?: boolean
  _notes?: string
  documents: Array<{
    docType: DocumentType
    confidence: number
    data: Record<string, unknown>
  }>
  declarationSnapshot?: {
    declarationNumber?: string
    declarationDate?: string
    regimeCode?: string
    incoterm?: string
    totalValue?: number
    currency?: string
    totalNetWeight?: number
    totalGrossWeight?: number
    packageCount?: number
    gtipCode?: string
  } | null
}

function loadFixture(fixturePath: string): FixtureFile {
  const content = readFileSync(fixturePath, 'utf-8')
  return JSON.parse(content) as FixtureFile
}

function buildContext(fixture: FixtureFile): SubmissionContext {
  const documents: ExtractionData[] = fixture.documents.map((doc) => ({
    docType: doc.docType,
    data: doc.data,
    confidence: doc.confidence,
  }))

  return {
    submissionId: `fixture-${fixture._fixture}`,
    tenantId: 'fixture-tenant',
    tradeFlow: fixture._tradeFlow,
    documents,
    declarationSnapshot: fixture.declarationSnapshot ?? null,
  }
}

function evaluateLikeProcessing(ctx: SubmissionContext): ReturnType<RuleEvaluator['evaluate']> {
  const ruleUsableDocs = ctx.documents.filter(
    (doc) => doc.confidence >= LOW_CONFIDENCE_THRESHOLD,
  )
  const isQualityOrPresence = (code: string) =>
    code.startsWith('QUAL-') || code.startsWith('PRES-') || code === 'OCR-001'
  const qualityAndPresenceRules = ALL_RULES.filter((r) => isQualityOrPresence(r.code))
  const contentRules = ALL_RULES.filter((r) => !isQualityOrPresence(r.code))

  return [
    ...new RuleEvaluator(qualityAndPresenceRules).evaluate(ctx),
    ...new RuleEvaluator(contentRules).evaluate({
      ...ctx,
      documents: ruleUsableDocs,
    }),
  ]
}

function runFixture(fixturePath: string): { passed: number; failed: number; errors: string[] } {
  const fixture = loadFixture(fixturePath)

  console.log(`\n▶ Fixture: ${fixture._fixture}`)
  console.log(`  ${fixture._description}`)

  const ctx = buildContext(fixture)
  const results = evaluateLikeProcessing(ctx)
  const resultMap = new Map(results.map((r) => [r.ruleCode, r.result]))

  const expected = fixture._expectedResults
  let passed = 0
  let failed = 0
  const errors: string[] = []

  for (const [ruleCode, expectedResult] of Object.entries(expected)) {
    if (expectedResult === null) {
      // Rule not expected to fire (e.g. wrong trade flow)
      const actual = resultMap.get(ruleCode)
      if (actual !== undefined && actual !== 'SKIP') {
        // Acceptable: rule fired with any result; just log
        console.log(`  ⚠ ${ruleCode}: expected null (skip), got ${actual} — acceptable`)
      }
      continue
    }

    const actual = resultMap.get(ruleCode)

    if (actual === undefined) {
      errors.push(`${ruleCode}: expected ${expectedResult} but rule did not produce a result`)
      failed++
      console.log(`  ✗ ${ruleCode}: expected ${expectedResult}, got <no result>`)
    } else if (actual === expectedResult) {
      console.log(`  ✓ ${ruleCode}: ${actual}`)
      passed++
    } else {
      errors.push(`${ruleCode}: expected ${expectedResult}, got ${actual}`)
      failed++
      console.log(`  ✗ ${ruleCode}: expected ${expectedResult}, got ${actual}`)
    }
  }

  if (fixture._assertNoFailures) {
    const failures = results.filter((r) => r.result === 'FAIL')
    if (failures.length === 0) {
      console.log('  ✓ no FAIL results')
      passed++
    } else {
      const failureCodes = failures.map((r) => r.ruleCode).join(', ')
      errors.push(`expected no FAIL results, got ${failureCodes}`)
      failed++
      console.log(`  ✗ expected no FAIL results, got ${failureCodes}`)
    }
  }

  return { passed, failed, errors }
}

async function main() {
  const fixturesDir = resolve(process.cwd(), '../../fixtures')
  let fixtureDirs: string[]

  try {
    fixtureDirs = readdirSync(fixturesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    console.error(`Cannot read fixtures directory: ${fixturesDir}`)
    console.error('Run from the packages/rules directory or repo root.')
    process.exit(1)
  }

  let totalPassed = 0
  let totalFailed = 0
  const allErrors: string[] = []

  for (const dir of fixtureDirs) {
    const fixturePath = join(fixturesDir, dir, 'extraction.json')
    try {
      const { passed, failed, errors } = runFixture(fixturePath)
      totalPassed += passed
      totalFailed += failed
      allErrors.push(...errors.map((e) => `[${dir}] ${e}`))
    } catch (err) {
      console.error(`  Error loading fixture ${dir}: ${err instanceof Error ? err.message : err}`)
      totalFailed++
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Fixture results: ${totalPassed} passed, ${totalFailed} failed`)

  if (totalFailed > 0) {
    console.log('\nFailures:')
    for (const err of allErrors) {
      console.log(`  - ${err}`)
    }
    process.exit(1)
  } else {
    console.log('All fixture tests passed ✓')
    process.exit(0)
  }
}

main()
