import assert from 'node:assert/strict'
import { toFiniteNumber } from './helpers.js'
import { CROSS_002 } from './rules/cross-document.js'
import type { SubmissionContext } from './types.js'
import { DocumentType } from '@gumrukyz/domain'

function testParseLocaleFormats() {
  assert.equal(toFiniteNumber('1.240'), 1240)
  assert.equal(toFiniteNumber('1.240,00'), 1240)
  assert.equal(toFiniteNumber('1,240.00'), 1240)
  assert.equal(toFiniteNumber('980,00'), 980)
  assert.equal(toFiniteNumber('1,185.00'), 1185)
}

function testCross002ScaleMismatchReviewNeeded() {
  const ctx: SubmissionContext = {
    submissionId: 'test',
    tenantId: 'tenant',
    tradeFlow: 'IMPORT',
    documents: [
      {
        docType: DocumentType.PACKING_LIST,
        confidence: 0.95,
        data: { gross_weight: 1.24 },
      },
      {
        docType: DocumentType.DECLARATION_OUTPUT,
        confidence: 0.95,
        data: { total_gross_weight: 1240 },
      },
    ],
    declarationSnapshot: {
      totalGrossWeight: 1240,
    },
  }

  const result = CROSS_002.evaluate(ctx)
  assert.ok(result)
  assert.equal(result.result, 'REVIEW_NEEDED')
}

function testCross002TrueMismatchStillFails() {
  const ctx: SubmissionContext = {
    submissionId: 'test',
    tenantId: 'tenant',
    tradeFlow: 'IMPORT',
    documents: [
      {
        docType: DocumentType.PACKING_LIST,
        confidence: 0.95,
        data: { gross_weight: 1240 },
      },
      {
        docType: DocumentType.DECLARATION_OUTPUT,
        confidence: 0.95,
        data: { total_gross_weight: 980 },
      },
    ],
    declarationSnapshot: {
      totalGrossWeight: 980,
    },
  }

  const result = CROSS_002.evaluate(ctx)
  assert.ok(result)
  assert.equal(result.result, 'FAIL')
}

const tests = [
  testParseLocaleFormats,
  testCross002ScaleMismatchReviewNeeded,
  testCross002TrueMismatchStillFails,
]

let failed = 0
for (const test of tests) {
  try {
    test()
    console.log(`✓ ${test.name}`)
  } catch (err) {
    failed += 1
    console.error(`✗ ${test.name}`, err)
  }
}

if (failed > 0) process.exit(1)
