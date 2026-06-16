import assert from 'node:assert/strict'
import { enhanceDeclarationOutputFromText, parseDeclarationSummaryRow } from './declaration-text-fallback'

const declarationText = `
Kalem             GTİP                           Eşya Tanımı                      Miktar          Net kg         Brüt kg     Kap      Fatura Tutarı         Gümrük
                                                                                                                                                             Kıymeti

    1         870829909000        Otobüs havalandırma kanalı aksamı                  240 adet       1,020.00      1,240.00     10       EUR 18,720.00      EUR 18,720.00
`

function testParsesDeclarationSummaryRow() {
  const row = parseDeclarationSummaryRow(declarationText)
  assert.ok(row)
  assert.equal(row.gtipCode, '870829909000')
  assert.equal(row.quantity, 240)
  assert.equal(row.netWeight, 1020)
  assert.equal(row.grossWeight, 1240)
  assert.equal(row.packageCount, 10)
  assert.equal(row.customsValue, 18720)
  assert.equal(row.customsCurrency, 'EUR')
}

function testEnhancementRepairsMisreadGrossWeight() {
  const enhanced = enhanceDeclarationOutputFromText(
    {
      gross_weight: 1.24,
      package_count: 13,
      total_value: null,
      currency: null,
      items: [{ gtip_code: '870829909000', gross_weight: 1.24 }],
    },
    declarationText,
  )

  assert.equal(enhanced['gross_weight'], 1240)
  assert.equal(enhanced['net_weight'], 1020)
  assert.equal(enhanced['package_count'], 10)
  assert.equal(enhanced['total_value'], 18720)
  assert.equal(enhanced['currency'], 'EUR')
  assert.deepEqual((enhanced['items'] as Array<Record<string, unknown>>)[0]?.['gross_weight'], 1240)
}

const tests = [
  testParsesDeclarationSummaryRow,
  testEnhancementRepairsMisreadGrossWeight,
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
