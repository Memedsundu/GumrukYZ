import assert from 'node:assert/strict'
import { enhanceDeclarationOutputFromText, parseDeclarationSummaryRow } from './declaration-text-fallback'

const declarationText = `
Kalem             GTİP                           Eşya Tanımı                      Miktar          Net kg         Brüt kg     Kap      Fatura Tutarı         Gümrük
                                                                                                                                                             Kıymeti

    1         870829909000        Otobüs havalandırma kanalı aksamı                  240 adet       1,020.00      1,240.00     10       EUR 18,720.00      EUR 18,720.00
`

const ankaraDeclarationText = `
MURATBEY GÜMRÜK MÜDÜRLÜĞÜ
060

9 KAP 498 AD Marka:ADDR                                                        1                 87082990     90      00
Ticari tanımı:OTOBÜS HAVALANDIRMA KANALI AKSAMLARI
TPS-E-Fatura Var 13.03.2026/26243160110886047396583/1-2-3
1-Tescilsiz---4454,92TL

Toplam FOB : 52056,03
Top.Miktar       : 503
Toplam Net / Brüt Kg: 3600 / 3980
Ambalaj             : KAP
TÜRKİYE
052

Kal   G.T.İ.P. EŞYANIN CİNSİ                                          MKTR                   MEN REJİ BRÜT KG        NET KG    ÖLÇÜ     İST MİK İST.KIYMET    KAL.FİYAT      KAP.AD
2     8708,29,   90,90,00 OTOBÜS HAVALANDIRMA KANALI AKSAMLARI                     5,00 AD   052   1000    6,44       5,83     AD          5,00       96,56       88,30       9
      EK BELGELER                        Kalem Notu :
      "Bedelsiz"
      IML=FARHYM OTO. SAN. TİC. LTD. ŞTİ./VN:4650222259 TPS-E-Fatura Var 13.03.2026/26243160110886047396611/1
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

function testEnhancementCapturesAnkaraDeclarationSignals() {
  const enhanced = enhanceDeclarationOutputFromText(
    {
      package_count: 6,
      gross_weight: null,
      net_weight: null,
      country_of_origin: 'POLONYA',
      items: [{ line_number: 2, country_of_origin: 'POLONYA' }],
    },
    ankaraDeclarationText,
  )

  assert.equal(enhanced['package_count'], 9)
  assert.deepEqual(enhanced['package_breakdown'], [{ type: 'kap', count: 9 }])
  assert.equal(enhanced['net_weight'], 3600)
  assert.equal(enhanced['gross_weight'], 3980)
  assert.equal(enhanced['fob_value'], 52056.03)
  assert.equal(enhanced['free_of_charge'], true)
  assert.deepEqual(
    (enhanced['invoice_refs'] as Array<Record<string, unknown>>).map((ref) => ({
      number: ref['number'],
      free_of_charge: ref['free_of_charge'],
    })),
    [
      {
        number: '13.03.2026/26243160110886047396583',
        free_of_charge: false,
      },
      {
        number: '13.03.2026/26243160110886047396611',
        free_of_charge: true,
      },
    ],
  )
  assert.ok(Array.isArray(enhanced['free_of_charge_line_values']))
  assert.ok((enhanced['free_of_charge_line_values'] as number[]).includes(88.3))
  assert.ok((enhanced['free_of_charge_line_values'] as number[]).includes(96.56))
  assert.equal((enhanced['free_of_charge_line_values'] as number[]).includes(4454.92), false)
  assert.equal(enhanced['country_of_origin'], 'Türkiye')
  assert.equal(enhanced['origin_country'], 'Türkiye')
  assert.equal(enhanced['customs_office_code'], '060')
  const items = enhanced['items'] as Array<Record<string, unknown>>
  const freeItem = items.find((item) => item['line_number'] === 2)
  assert.ok(freeItem)
  assert.equal(freeItem['gtip_code'], '870829909000')
  assert.equal(freeItem['quantity'], 5)
  assert.equal(freeItem['gross_weight'], 6.44)
  assert.equal(freeItem['net_weight'], 5.83)
  assert.equal(freeItem['customs_value'], 88.3)
  assert.equal(freeItem['statistical_value'], 96.56)
  assert.equal(freeItem['package_count'], 9)
  assert.equal(freeItem['country_of_origin'], 'Türkiye')
}

const tests = [
  testParsesDeclarationSummaryRow,
  testEnhancementRepairsMisreadGrossWeight,
  testEnhancementCapturesAnkaraDeclarationSignals,
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
