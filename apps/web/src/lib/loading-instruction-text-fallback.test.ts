import assert from 'node:assert/strict'
import {
  enhanceLoadingInstructionFromText,
  parseLoadingInstructionTextFields,
} from './loading-instruction-text-fallback'

function testParsesGrossOnlyLoadingInstructionRow() {
  const text = `
Yük Bilgileri
Sıra
Eşya Tanımı
1
Otobüs havalandırma kanalı aksamı
GTİP
870829909000
Miktar
180 adet
Kap / Ambalaj
8 wooden boxes / 2 pallets
Brüt kg
1,240.00
`

  const fields = parseLoadingInstructionTextFields(text)

  assert.equal(fields.packageCount, 8)
  assert.equal(fields.grossWeight, 1240)
  assert.equal(fields.netWeight, null)
}

function testEnhancementDoesNotKeepInventedNetOrSummedPackages() {
  const text = 'Kap / Ambalaj 8 wooden boxes / 2 pallets Brüt kg 1,240.00'
  const enhanced = enhanceLoadingInstructionFromText(
    {
      package_count: 10,
      gross_weight: 1.24,
      net_weight: 1240,
    },
    text,
  )

  assert.equal(enhanced['package_count'], 8)
  assert.equal(enhanced['gross_weight'], 1240)
  assert.equal(enhanced['net_weight'], null)
  assert.notEqual(enhanced['package_count'], 10)
}

function testParsesSeparateAnkaraPackageLinesAsTotalPackages() {
  const text = `
Kap Adedi / Cinsi     : 6 pcs wooden box
                      : 3 pcs pallet

Brüt Kilo (kg)        : 3980 kg
`

  const fields = parseLoadingInstructionTextFields(text)

  assert.equal(fields.packageCount, 9)
  assert.deepEqual(fields.packageBreakdown, [
    { type: 'wooden_box', count: 6 },
    { type: 'pallet', count: 3 },
  ])
  assert.equal(fields.grossWeight, 3980)
  assert.equal(fields.netWeight, null)
}

const tests = [
  testParsesGrossOnlyLoadingInstructionRow,
  testEnhancementDoesNotKeepInventedNetOrSummedPackages,
  testParsesSeparateAnkaraPackageLinesAsTotalPackages,
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
