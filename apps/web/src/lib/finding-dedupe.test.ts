import assert from 'node:assert/strict'
import { filterExpertFindingsAgainstRules, type DedupeExpertFinding } from './finding-dedupe'

const gtipFinding: DedupeExpertFinding = {
  area: 'GTIP_PLAUSIBILITY',
  title: '870829 kodu teknik teyit istiyor',
  explanation: 'Kod makul adaydır ancak teknik çizim gerekir.',
  recommendation: 'Teknik çizim, malzeme ve montaj yeri doğrulanmalı.',
}

function testDropsPackingDuplicatesButKeepsGtip() {
  const findings: DedupeExpertFinding[] = [
    {
      area: 'DOCUMENT_CONSISTENCY',
      title: 'Çeki listesi toplamları uyumsuz',
      explanation: 'Satır kap toplamı 10 iken toplam kap sayısı 7 görünüyor; ağırlık toplamları da farklı.',
      recommendation: 'Çeki listesindeki kap ve ağırlık toplamları düzeltilmeli.',
    },
    gtipFinding,
  ]

  const filtered = filterExpertFindingsAgainstRules(findings, [
    { ruleCode: 'PL-001', result: 'REVIEW_NEEDED' },
    { ruleCode: 'PL-002', result: 'REVIEW_NEEDED' },
  ])

  assert.deepEqual(filtered, [gtipFinding])
}

function testDropsFilenameTypeDuplicate() {
  const findings: DedupeExpertFinding[] = [
    {
      area: 'DOCUMENT_QUALITY',
      title: 'Dosya adı belge türünü karıştırabilir',
      explanation: 'Filename FI2026-00077.pdf fatura izlenimi verirken document type packing list.',
      recommendation: 'Belge türü ve dosya adı kontrol edilmeli.',
    },
  ]

  const filtered = filterExpertFindingsAgainstRules(findings, [
    { ruleCode: 'QUAL-002', result: 'REVIEW_NEEDED' },
  ])

  assert.equal(filtered.length, 0)
}

function testDropsOcrDuplicate() {
  const findings: DedupeExpertFinding[] = [
    {
      area: 'DOCUMENT_QUALITY',
      title: 'Fatura düşük kaliteli tarama',
      explanation: 'Scanned invoice has OCR and raster scan quality limitations.',
      recommendation: 'Daha net kopya yüklenmeli.',
    },
  ]

  const filtered = filterExpertFindingsAgainstRules(findings, [
    { ruleCode: 'OCR-001', result: 'REVIEW_NEEDED' },
  ])

  assert.equal(filtered.length, 0)
}

function testDropsFreeOfChargeDuplicateButKeepsGtip() {
  const findings: DedupeExpertFinding[] = [
    {
      area: 'VALUATION',
      title: 'Bedelsiz kalem destek faturası istiyor',
      explanation: 'F.O.C fatura dosyada yok ve bedelsiz notlu kalemde değer görünüyor.',
      recommendation: 'F.O.C faturayı ve değer açıklamasını isteyin.',
    },
    gtipFinding,
  ]

  const filtered = filterExpertFindingsAgainstRules(findings, [
    { ruleCode: 'EXP-006', result: 'REVIEW_NEEDED' },
  ])

  assert.deepEqual(filtered, [gtipFinding])
}

const tests = [
  testDropsPackingDuplicatesButKeepsGtip,
  testDropsFilenameTypeDuplicate,
  testDropsOcrDuplicate,
  testDropsFreeOfChargeDuplicateButKeepsGtip,
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
