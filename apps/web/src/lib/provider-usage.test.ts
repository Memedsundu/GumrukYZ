import assert from 'node:assert/strict'
import { azureProviderUsageFields, openAIProviderUsageFields } from './provider-usage'

function testAzureUsageFields() {
  const fields = azureProviderUsageFields({
    text: 'hello',
    confidence: 0.99,
    pageCount: 3,
    method: 'AZURE_DOC_INTEL',
    tableCount: 1,
    estimatedCostUsd: 0.03,
    modelId: 'prebuilt-layout',
    apiVersion: '2024-11-30',
  })

  assert.equal(fields.pageCount, 3)
  assert.equal(fields.billableUnits, 3)
  assert.equal(fields.billableUnitType, 'page')
  assert.equal(fields.unitPriceUsd, 0.01)
  assert.equal(fields.estimatedCostUsd, 0.03)
}

function testOpenAIUsageFields() {
  const fields = openAIProviderUsageFields({
    model: 'gpt-5.4-mini',
    inputTokens: 1000,
    outputTokens: 500,
    estimatedCostUsd: 0.006,
  })

  assert.equal(fields.model, 'gpt-5.4-mini')
  assert.equal(fields.inputTokens, 1000)
  assert.equal(fields.outputTokens, 500)
  assert.equal(fields.billableUnits, 1500)
  assert.equal(fields.billableUnitType, 'token')
  assert.equal(fields.unitPriceUsd, 0.000004)
}

testAzureUsageFields()
testOpenAIUsageFields()
console.log('provider-usage tests passed')
