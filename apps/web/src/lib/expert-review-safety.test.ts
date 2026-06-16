import assert from 'node:assert/strict'
import {
  EXPERT_REVIEW_SAFETY_GUARDRAILS,
  applyExpertReviewSafetyFilters,
  type ExpertReviewSafetyFinding,
} from './expert-review-safety'

const gtipFinding: ExpertReviewSafetyFinding = {
  area: 'GTIP_PLAUSIBILITY',
  title: '870829 sınıflandırması teknik teyit istiyor',
  explanation: '8708/870829 makul adaydır; teknik çizim ve montaj yeri gerekir.',
  recommendation: 'Teknik katalog, malzeme ve işlev açıklaması istenmelidir.',
  evidence_refs: [{ docType: 'DECLARATION_OUTPUT', field: 'gtip_code', value: '870829909000' }],
}

const valuationFinding: ExpertReviewSafetyFinding = {
  area: 'VALUATION',
  title: 'Fatura ve beyan toplamı ciddi farklı',
  explanation: 'Fatura toplamı 8.830 EUR, beyanname toplamı 52.056,03 EUR.',
  recommendation: 'Fatura, beyan ve varsa ek masraf kayıtlarını birlikte kontrol edin.',
  evidence_refs: [
    { docType: 'INVOICE', field: 'total_amount', value: '8830' },
    { docType: 'DECLARATION_OUTPUT', field: 'total_value', value: '52056.03' },
  ],
}

function testGuardrailsMentionCleanExportFalsePositives() {
  assert.match(EXPERT_REVIEW_SAFETY_GUARDRAILS, /CROSS-008/)
  assert.match(EXPERT_REVIEW_SAFETY_GUARDRAILS, /CMR/)
  assert.match(EXPERT_REVIEW_SAFETY_GUARDRAILS, /DAP Warszawa, Poland/)
  assert.match(EXPERT_REVIEW_SAFETY_GUARDRAILS, /A\.TR/)
  assert.match(EXPERT_REVIEW_SAFETY_GUARDRAILS, /870829909000/)
}

function testDropsUnsupportedFindingsButKeepsGtipReview() {
  const filtered = applyExpertReviewSafetyFilters(
    {
      overallRisk: 'MEDIUM',
      summary: 'Kap adedi, CMR ve tercih belgesi belirsiz.',
      findings: [
        gtipFinding,
        {
          area: 'DOCUMENT_CONSISTENCY',
          title: 'Kap adedi belgelerde aynı değil',
          explanation: 'Beyanname ve çeki listesinde 10 kap, yükleme talimatında 13 kap görünüyor.',
          recommendation: 'Paket ve palet ayrımı netleştirilmelidir.',
          evidence_refs: [
            { docType: 'DECLARATION_OUTPUT', field: 'package_count', value: '10' },
            { docType: 'PACKING_LIST', field: 'package_count', value: '10' },
            { docType: 'LOADING_INSTRUCTION', field: 'package_count', value: '13' },
          ],
        },
        {
          area: 'INCOTERM',
          title: 'DAP teslimde taşıma belgesi görünmüyor',
          explanation: 'CMR veya taşıma belgesi dosyada yok.',
          recommendation: 'CMR dosyaya eklenmelidir.',
          evidence_refs: [{ docType: 'INVOICE', field: 'incoterm', value: 'DAP' }],
        },
        {
          area: 'ORIGIN_PREFERENTIAL',
          title: 'Polonya sevkinde tercih belgesi planı belirsiz',
          explanation: 'A.TR veya EUR.1 görünmüyor.',
          recommendation: 'Tercihli tarife beklentisi teyit edilmelidir.',
          evidence_refs: [{ docType: 'INVOICE', field: 'country_of_origin', value: 'Türkiye / Turkey' }],
        },
        {
          area: 'PERMIT_PRODUCT_CONTROL',
          title: 'HVAC işlevi kontrol setini değiştirebilir',
          explanation: 'Ventilation duct HVAC işlevi teknik teyit ister.',
          recommendation: 'Teknik katalog istenmelidir.',
          evidence_refs: [{ docType: 'INVOICE', field: 'description', value: 'Bus ventilation duct components' }],
        },
      ],
    },
    {
      documents: [
        {
          docType: 'INVOICE',
          data: {
            country_of_origin: 'Türkiye / Turkey',
            buyer_address: 'Warszawa, Poland',
          },
        },
      ],
      ruleResults: [
        { ruleCode: 'CROSS-008', result: 'PASS' },
        { ruleCode: 'CROSS-003', result: 'PASS' },
        { ruleCode: 'EXP-004', result: 'PASS' },
      ],
    },
  )

  assert.equal(filtered.findings.length, 1)
  assert.equal(filtered.findings[0]?.area, 'GTIP_PLAUSIBILITY')
  assert.equal(filtered.overallRisk, 'LOW')
  assert.match(filtered.summary, /yalnızca GTİP/)
}

function testDropsPassedIncotermNoiseButKeepsValuationAndGtip() {
  const filtered = applyExpertReviewSafetyFilters(
    {
      overallRisk: 'HIGH',
      summary: 'Kıymet farkı ve DAP teslim ifadesi var.',
      findings: [
        gtipFinding,
        valuationFinding,
        {
          area: 'INCOTERM',
          title: 'DAP teslim ifadesi tam eşleşmiyor',
          explanation:
            'Beyanname ve faturada Incoterm DAP, yükleme talimatında ise DAP Warszawa, Poland yer alıyor.',
          recommendation: 'DAP teslim yerini tüm belgelerde aynı ifadeyle yazın.',
          evidence_refs: [
            { docType: 'DECLARATION_OUTPUT', field: 'incoterm', value: 'DAP' },
            { docType: 'LOADING_INSTRUCTION', field: 'delivery_term', value: 'DAP Warszawa, Poland' },
          ],
        },
      ],
    },
    {
      documents: [],
      ruleResults: [
        { ruleCode: 'CROSS-001', result: 'FAIL' },
        { ruleCode: 'CROSS-003', result: 'PASS' },
      ],
    },
  )

  assert.deepEqual(filtered.findings.map((finding) => finding.area), ['GTIP_PLAUSIBILITY', 'VALUATION'])
  assert.equal(filtered.overallRisk, 'HIGH')
}

const tests = [
  testGuardrailsMentionCleanExportFalsePositives,
  testDropsUnsupportedFindingsButKeepsGtipReview,
  testDropsPassedIncotermNoiseButKeepsValuationAndGtip,
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
