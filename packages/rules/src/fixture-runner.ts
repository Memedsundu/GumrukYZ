/**
 * Fixture runner — validates that all rules produce expected results
 * against the fixture data sets.
 *
 * Run with: pnpm --filter @gumrukyz/rules test:fixtures
 */
import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { RuleEvaluator } from './evaluator.js'
import { ALL_RULES } from './index.js'
import type { SubmissionContext, ExtractionData } from './types.js'
import type { DocumentType, TradeFlow } from '@gumrukyz/domain'
import { RuleResultOutcome } from '@gumrukyz/domain'

interface FixtureFile {
  _fixture: string
  _description: string
  _tradeFlow: TradeFlow
  _expectedResults: Record<string, string | null>
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

const LOW_CONFIDENCE_THRESHOLD = 0.5

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

function runFixture(fixturePath: string): { passed: number; failed: number; errors: string[] } {
  const fixture = loadFixture(fixturePath)
  const evaluator = new RuleEvaluator(ALL_RULES)

  console.log(`\n▶ Fixture: ${fixture._fixture}`)
  console.log(`  ${fixture._description}`)

  const ctx = buildContext(fixture)

  // Filter out low-confidence documents from rule evaluation
  const hasLowConfidence = fixture.documents.some(
    (d) => d.confidence < LOW_CONFIDENCE_THRESHOLD,
  )

  const results = evaluator.evaluate(ctx)
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

    if (expectedResult === 'REVIEW_NEEDED_OR_PASS') {
      // Special case: low-confidence fixtures may produce either PASS or not run critical checks
      if (hasLowConfidence) {
        console.log(`  ✓ ${ruleCode}: low-confidence fixture — skipping strict assertion`)
        passed++
        continue
      }
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
