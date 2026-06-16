import assert from 'node:assert/strict'
import {
  enhancePackingListFromText,
  parsePackingListTextFields,
} from './packing-list-text-fallback'

const packingListText = `
PACKING LIST / ÇEKİ LİSTESİ

Packing List No
PL2026-00068

Related Invoice
FI2026-00068

Shipment Ref
GYZ-PKG-004

Destination
Poland

Package Summary
12 wooden boxes on 3 pallets

Package Details / Ambalaj Bilgileri
Marks / Package ID
Package Type
Package Count
Contents
Quantity Inside

PALLET-01 / BOX 1-4
Wooden box / Ahşap sandık
4 boxes
Otobüs havalandırma kanalı aksamı - 160 pieces inside
160 pcs/adet

PALLET-02 / BOX 5-8
Wooden box / Ahşap sandık
4 boxes
Otobüs havalandırma kanalı aksamı - 160 pieces inside
160 pcs/adet

PALLET-03 / BOX 9-12
Wooden box / Ahşap sandık
4 boxes
Otobüs havalandırma kanalı aksamı - 160 pieces inside
160 pcs/adet

Total Quantity
480 pcs/adet

Total Packages
12 wooden boxes on 3 pallets

Total Net Weight
980.00 kg

Total Gross Weight
1,185.00 kg
`

const ankaraPackingListText = `
ÇEKİ LİSTESİ / PACKING LIST

Fatura no.
FI62026000000062
FI62026000000063 (F.O.C)

Muhteviyat          Paket No.   Paket Türü         Miktar (Birim) Brüt Ağırlık
                               Package Type        Quantity (Unit)   Gross
AIR CHANNEL
                        1        WOODEN BOX              1            650
SCOPE
AIR CHANNEL
                        1        WOODEN BOX              1            650
SCOPE
AIR CHANNEL
                        1        WOODEN BOX              1            580
SCOPE
AIR CHANNEL
                        1        WOODEN BOX              1            550
SCOPE
AIR CHANNEL
                        1        WOODEN BOX              1            550
SCOPE
AIR CHANNEL
                        1        WOODEN BOX              1            550
SCOPE
AIR CHANNEL
                        1           PALLETE              1            150
SCOPE
AIR CHANNEL
                        1           PALLETE              1            150
SCOPE
AIR CHANNEL
                        1           PALLETE              1            150
SCOPE

TOPLAM
                                                         9            3980
TOTAL
`

function testParsesPackageQuantityAndWeightsSeparately() {
  const fields = parsePackingListTextFields(packingListText)

  assert.equal(fields.packageCount, 12)
  assert.equal(fields.totalQuantity, 480)
  assert.equal(fields.itemQuantities.reduce((sum, quantity) => sum + quantity, 0), 480)
  assert.deepEqual(fields.itemPackageCounts, [4, 4, 4])
  assert.equal(fields.netWeight, 980)
  assert.equal(fields.grossWeight, 1185)
}

function testEnhancementDoesNotSumPalletsIntoPackageCount() {
  const enhanced = enhancePackingListFromText(
    {
      package_count: 15,
      gross_weight: 1.185,
      net_weight: 98000,
      items: [
        { quantity: 4, package_count: 7 },
        { quantity: 4, package_count: 4 },
        { quantity: 4, package_count: 4 },
      ],
    },
    packingListText,
  )

  const items = enhanced['items'] as Array<Record<string, unknown>>

  assert.equal(enhanced['package_count'], 12)
  assert.notEqual(enhanced['package_count'], 15)
  assert.equal(enhanced['net_weight'], 980)
  assert.equal(enhanced['gross_weight'], 1185)
  assert.deepEqual(items.map((item) => item['quantity']), [160, 160, 160])
  assert.equal(items.reduce((sum, item) => sum + Number(item['quantity']), 0), 480)
  assert.deepEqual(items.map((item) => item['package_count']), [4, 4, 4])
}

function testParsesExplicitTotalAndPackageRowsFromAnkaraLayout() {
  const fields = parsePackingListTextFields(ankaraPackingListText)

  assert.equal(fields.packageCount, 9)
  assert.deepEqual(fields.packageBreakdown, [
    { type: 'wooden_box', count: 6 },
    { type: 'pallet', count: 3 },
  ])
  assert.equal(fields.itemPackageCounts.reduce((sum, count) => sum + count, 0), 9)
  assert.equal(fields.grossWeight, 3980)
  assert.deepEqual(fields.invoiceRefs, [
    { number: 'FI62026000000062', free_of_charge: false },
    { number: 'FI62026000000063', free_of_charge: true },
  ])
}

function testEnhancementReplacesPartialPackageRowsFromAnkaraLayout() {
  const enhanced = enhancePackingListFromText(
    {
      package_count: 6,
      items: Array.from({ length: 6 }, () => ({ package_count: 1 })),
    },
    ankaraPackingListText,
  )

  const items = enhanced['items'] as Array<Record<string, unknown>>
  assert.equal(enhanced['package_count'], 9)
  assert.deepEqual(enhanced['package_breakdown'], [
    { type: 'wooden_box', count: 6 },
    { type: 'pallet', count: 3 },
  ])
  assert.equal(items.length, 9)
  assert.equal(items.reduce((sum, item) => sum + Number(item['package_count']), 0), 9)
}

const tests = [
  testParsesPackageQuantityAndWeightsSeparately,
  testEnhancementDoesNotSumPalletsIntoPackageCount,
  testParsesExplicitTotalAndPackageRowsFromAnkaraLayout,
  testEnhancementReplacesPartialPackageRowsFromAnkaraLayout,
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
