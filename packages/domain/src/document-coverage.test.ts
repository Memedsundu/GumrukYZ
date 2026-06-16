import assert from 'node:assert/strict'
import { DocumentType, TradeFlow } from './enums.js'
import { classifyDocumentCoverage } from './document-coverage.js'

function testImportMissingTransport() {
  const result = classifyDocumentCoverage({
    tradeFlow: TradeFlow.IMPORT,
    uploadedDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST, DocumentType.DECLARATION_OUTPUT],
  })
  assert.equal(result.isComplete, false)
  assert.deepEqual(result.missingExpected, [DocumentType.TRANSPORT_DOC])
  assert.match(result.limitationNotice, /sınırlıdır/)
}

function testStandardExportInvoicePackingListIsComplete() {
  const result = classifyDocumentCoverage({
    tradeFlow: TradeFlow.EXPORT,
    uploadedDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST],
  })
  assert.equal(result.isComplete, true)
  assert.deepEqual(result.missingExpected, [])
  assert.deepEqual(result.missingConditional, [])
}

function testTemporaryExportConditionallyRequiresLoadingInstruction() {
  const result = classifyDocumentCoverage({
    tradeFlow: TradeFlow.EXPORT,
    uploadedDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST, DocumentType.DECLARATION_OUTPUT],
    declarationSnapshot: { regimeCode: '2100' },
  })
  assert.equal(result.isComplete, false)
  assert.deepEqual(result.missingExpected, [])
  assert.deepEqual(result.missingConditional, [DocumentType.LOADING_INSTRUCTION])
}

function testCompleteImportSet() {
  const result = classifyDocumentCoverage({
    tradeFlow: TradeFlow.IMPORT,
    uploadedDocTypes: [
      DocumentType.INVOICE,
      DocumentType.PACKING_LIST,
      DocumentType.BILL_OF_LADING,
      DocumentType.DECLARATION_OUTPUT,
    ],
  })
  assert.equal(result.isComplete, true)
  assert.deepEqual(result.missingExpected, [])
  assert.deepEqual(result.missingConditional, [])
}

function testConditionalOriginOnlyWhenSignalExists() {
  const withoutSignal = classifyDocumentCoverage({
    tradeFlow: TradeFlow.IMPORT,
    uploadedDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST, DocumentType.TRANSPORT_DOC, DocumentType.DECLARATION_OUTPUT],
    declarationSnapshot: { regimeCode: '1040' },
  })
  assert.deepEqual(withoutSignal.missingConditional, [])

  const withSignal = classifyDocumentCoverage({
    tradeFlow: TradeFlow.IMPORT,
    uploadedDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST, DocumentType.TRANSPORT_DOC, DocumentType.DECLARATION_OUTPUT],
    declarationSnapshot: { regimeCode: '4200' },
  })
  assert.deepEqual(withSignal.missingConditional, [DocumentType.ORIGIN_DOC])
}

const tests = [
  testImportMissingTransport,
  testStandardExportInvoicePackingListIsComplete,
  testTemporaryExportConditionallyRequiresLoadingInstruction,
  testCompleteImportSet,
  testConditionalOriginOnlyWhenSignalExists,
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
