import assert from 'node:assert/strict'
import {
  AI_RULE_VALIDATION_SAFETY_GUARDRAILS,
  applyAiRuleValidationSafetyFilters,
  type AiRuleValidationSafetyItem,
} from './ai-rule-validation-safety'

function testGuardrailsMentionPackageAndIncotermSemantics() {
  assert.match(AI_RULE_VALIDATION_SAFETY_GUARDRAILS, /5 wooden boxes \/ 2 pallets/)
  assert.match(AI_RULE_VALIDATION_SAFETY_GUARDRAILS, /8 wooden boxes \/ 2 pallets/)
  assert.match(AI_RULE_VALIDATION_SAFETY_GUARDRAILS, /CROSS-008/)
  assert.match(AI_RULE_VALIDATION_SAFETY_GUARDRAILS, /DAP Warszawa, Poland/)
  assert.match(AI_RULE_VALIDATION_SAFETY_GUARDRAILS, /_native_text_length/)
}

function testDropsPackageCountFalseNegativeWhenPackageRulePassed() {
  const validations: AiRuleValidationSafetyItem[] = [
    {
      rule_result_id: 'cross-002-pass',
      status: 'POTENTIAL_FALSE_NEGATIVE',
      confidence: 0.72,
      explanation:
        'Brüt ağırlık eşleşiyor; ancak yükleme talimatında paket sayısı 7, çeki listesi ve beyannamede 5 görünüyor.',
      recommendation: 'Yükleme talimatındaki paket sayısı ile çeki listesi/beyanname paket sayısı kontrol edilmeli.',
      evidence_refs: [
        { docType: 'LOADING_INSTRUCTION', field: 'package_count', value: '7' },
        { docType: 'PACKING_LIST', field: 'package_count', value: '5' },
        { docType: 'DECLARATION_OUTPUT', field: 'package_count', value: '5' },
      ],
    },
  ]

  const filtered = applyAiRuleValidationSafetyFilters(validations, [
    { id: 'cross-002-pass', ruleCode: 'CROSS-002', result: 'PASS' },
    { id: 'cross-008-pass', ruleCode: 'CROSS-008', result: 'PASS' },
    { id: 'pl-001-pass', ruleCode: 'PL-001', result: 'PASS' },
  ])

  assert.equal(filtered.length, 0)
}

function testDropsMixedPackageLevelsWhenPackingRulePassed() {
  const validations: AiRuleValidationSafetyItem[] = [
    {
      rule_result_id: 'pl-001-pass',
      status: 'POTENTIAL_FALSE_NEGATIVE',
      confidence: 0.7,
      explanation: 'PL-001 geçti ancak yükleme talimatında 8 wooden boxes / 2 pallets toplam 10 paket gibi görünüyor.',
      recommendation: 'Paket sayısı 10 olarak tekrar kontrol edilmeli.',
      evidence_refs: [
        { docType: 'LOADING_INSTRUCTION', field: 'package_count', value: '10' },
        { docType: 'PACKING_LIST', field: 'package_count', value: '8' },
      ],
    },
  ]

  const filtered = applyAiRuleValidationSafetyFilters(validations, [
    { id: 'pl-001-pass', ruleCode: 'PL-001', result: 'PASS' },
  ])

  assert.equal(filtered.length, 0)
}

function testDropsNativeTextOnlyLoadingInstructionUnverifiedFinding() {
  const validations: AiRuleValidationSafetyItem[] = [
    {
      rule_result_id: 'pres-006-pass',
      status: 'POTENTIAL_FALSE_NEGATIVE',
      confidence: 0.67,
      explanation:
        'Yükleme talimatı mevcut görünüyor ancak _native_text_length=0 olduğu için loading instruction content unverified.',
      recommendation: 'Yükleme talimatı içeriği yeniden doğrulanmalı.',
      evidence_refs: [
        { docType: 'LOADING_INSTRUCTION', field: '_native_text_length', value: '0' },
        { docType: 'LOADING_INSTRUCTION', field: '_native_text_confidence', value: '0' },
      ],
    },
  ]

  const filtered = applyAiRuleValidationSafetyFilters(validations, [
    { id: 'pres-006-pass', ruleCode: 'PRES-006', result: 'PASS' },
  ])

  assert.equal(filtered.length, 0)
}

function testKeepsValuationLikelyCorrectSupport() {
  const validations: AiRuleValidationSafetyItem[] = [
    {
      rule_result_id: 'cross-001-fail',
      status: 'LIKELY_CORRECT',
      confidence: 0.96,
      explanation: 'Fatura toplamı 8,830 EUR ile beyanname toplam değeri 52,056.03 EUR arasında belirgin fark var.',
      recommendation: 'Deterministik FAIL sonucu korunmalı.',
      evidence_refs: [
        { docType: 'INVOICE', field: 'total_amount', value: '8830' },
        { docType: 'DECLARATION_OUTPUT', field: 'total_value', value: '52056.03' },
      ],
    },
  ]

  const filtered = applyAiRuleValidationSafetyFilters(validations, [
    { id: 'cross-001-fail', ruleCode: 'CROSS-001', result: 'FAIL' },
  ])

  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.rule_result_id, 'cross-001-fail')
}

const tests = [
  testGuardrailsMentionPackageAndIncotermSemantics,
  testDropsPackageCountFalseNegativeWhenPackageRulePassed,
  testDropsMixedPackageLevelsWhenPackingRulePassed,
  testDropsNativeTextOnlyLoadingInstructionUnverifiedFinding,
  testKeepsValuationLikelyCorrectSupport,
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
