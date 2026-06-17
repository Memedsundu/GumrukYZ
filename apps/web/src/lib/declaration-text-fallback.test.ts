import assert from 'node:assert/strict'
import {
  enhanceDeclarationOutputFromText,
  findWrappedGtipCodes,
  parseDeclarationSummaryRow,
} from './declaration-text-fallback'

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

const wrappedAnkaraDeclarationText = `
MURATBEY GÜMRÜK MÜDÜRLÜĞÜ
060

Kal
G.T.İ.P. EŞYANIN CİNSİ

2

8708,29,
90,90,00

DOSYA NO:26-00721
OTOBÜS HAVALANDIRMA KANALI AKSAMLARI
1-Tescilsiz---4454,92TL

MKTR
MEN REJİ BRÜT KG
5,00 AD
052
1000
6,44
NET KG
5,83
ÖLÇÜ
AD
İST MİK İST.KIYMET
5,00
96,56
KAL.FİYAT
88,30
KAP.AD
9
EK BELGELER
Kalem Notu :
"Bedelsiz"
IML=FARHYM OTO. SAN. TİC. LTD. ŞTİ./VN:4650222259 TPS-E-Fatura Var 13.03.2026/26243160110886047396611/1
TÜRKİYE
`

const evrimBeyannameLayoutText = `
                          4650222259 / ULUS
   FARHYM OTO. SAN. TİC. LTD. ŞTİ.                                                                       MURATBEY GÜMRÜK MÜDÜRLÜĞÜ
   ESENBOĞA YOLU 23.KM 06750- AKYURT/ANKARA

  MAN BUS S.P. Z.O.O.                                               FARHYM OTO. SAN. TİC. LTD. ŞTİ.
  UL.1 MAJA 12 NO:01/07/2017

                                                                   060                      060
 26-00721                  2030329463                              TÜRKİYE                                     052               060

 34 MZY 585 - 81 EL 191                             052        0   DAP                       STARACHOWICE
 34 MZY 585 - 81 EL 191                                     052    EUR 54.556,03                              50,45210

 9 KAP 498 AD Marka:ADDR                                                        1                 87082990     90      00
 Ticari tanımı:OTOBÜS HAVALANDIRMA KANALI AKSAMLARI                                               052          3.973,56
 1-Tescilsiz---2748011,36TL
                                                                                                  1000         3.594,17

 VEKALET='AKYURT 1. NOTERLİĞİ -04255-12.05.2025/ 23/06/OKS/0100 OKSB BELGESI
                                                                                              498              AD 54.467,73
 EKLI,564.DİLEKÇE EKLİ' NOTIFY:MAN BUS SP Z.O.O.-POLONYA - 2.KALEM 2008/1 2
 TEBLİĞİ 2B MADDESİNE İSTİNADEN BEDELSİZ İHRACATTIR. IML=FARHYM OTO.
 SAN. TİC. LTD. ŞTİ./VN:4650222259 TPS-E-Fatura Var 13.03.2026/262431601108860473
 96583/1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16-17-18-19-20-21-22-23-24-25-26-
 27-28-29-30-31-32-33-34-35-36-37-38-39-40-41-42-43-44-45-46-47-48-49-50-51- 52-53                                   59.564,42

Toplam FOB : 52056,03
G.Ç. Amacı        : |Açıklama :                                                       İSTANBUL 14.03.2026
Top.Miktar       : 503
Toplam Net / Brüt Kg: 3600 / 3980                                                     SEZGİN İNSAL M/35/03110
Ambalaj             : KAP

T.C. GÜMRÜK BEYANNAMESİ EKLİ LİSTESİ
BEYAN      İHRACATÇI=      FARHYM OTO. SAN. TİC. LTD. ŞTİ.                                                          DOSYA NO:26-00721
EU    1                    VN=4650222259 / ULUS       TESCİL NO - TARİHİ=    /
Kal   G.T.İ.P. EŞYANIN CİNSİ                                          MKTR                   MEN REJİ BRÜT KG        NET KG    ÖLÇÜ     İST MİK İST.KIYMET    KAL.FİYAT      KAP.AD
2     8708,29,   OTOBÜS HAVALANDIRMA KANALI AKSAMLARI                              5,00 AD   052   1000    6,44       5,83     AD          5,00       96,56       88,30       9
      90,90,00   1-Tescilsiz---4454,92TL                                                                                                                          84,25
      EK BELGELER                        Kalem Notu :
      "Bedelsiz"
      IML=FARHYM OTO. SAN. TİC. LTD. ŞTİ./VN:4650222259 TPS-E-Fatura Var 13.03.2026/26243160110886047396611/1
      No : -

                 Toplam:                                                         503,00 AD                3980,00    3600,00             503,00   59.660,98    54.556,03
                                                                                                                                                               52.056,03
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

function testWrappedGtipDeclarationLineIsReconstructed() {
  assert.deepEqual(findWrappedGtipCodes(wrappedAnkaraDeclarationText), ['870829909000'])
  assert.deepEqual(
    findWrappedGtipCodes(`
2     8708,29,   OTOBÜS HAVALANDIRMA KANALI AKSAMLARI                     9
      90,90,00   1-Tescilsiz---4454,92TL
`),
    ['870829909000'],
  )

  const enhanced = enhanceDeclarationOutputFromText(
    {
      gtip_code: '8708,29,',
      items: [{ line_number: 2, gtip_code: '8708,29,' }],
    },
    wrappedAnkaraDeclarationText,
  )

  assert.equal(enhanced['gtip_code'], '870829909000')
  assert.ok(Array.isArray(enhanced['free_of_charge_line_values']))
  assert.ok((enhanced['free_of_charge_line_values'] as number[]).includes(88.3))
  assert.ok((enhanced['free_of_charge_line_values'] as number[]).includes(96.56))
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
}

function testEvrimBeyannameLayoutExtractsCommonFields() {
  const enhanced = enhanceDeclarationOutputFromText({}, evrimBeyannameLayoutText)

  assert.equal(enhanced['declaration_number'], '26-00721')
  assert.equal(enhanced['declaration_date'], '2026-03-14')
  assert.equal(enhanced['exporter_tax_id'], '4650222259')
  assert.equal(enhanced['exporter'], 'FARHYM OTO. SAN. TİC. LTD. ŞTİ.')
  assert.equal(enhanced['importer'], 'MAN BUS S.P. Z.O.O.')
  assert.equal(enhanced['gtip_code'], '870829909000')
  assert.equal(enhanced['package_count'], 9)
  assert.equal(enhanced['net_weight'], 3600)
  assert.equal(enhanced['gross_weight'], 3980)
  assert.equal(enhanced['currency'], 'EUR')
  assert.equal(enhanced['total_value'], 54556.03)
  assert.equal(enhanced['fob_value'], 52056.03)
  assert.equal(enhanced['statistical_value'], 59660.98)
  assert.equal(enhanced['incoterm'], 'DAP STARACHOWICE')

  const items = enhanced['items'] as Array<Record<string, unknown>>
  assert.equal(items.length, 2)
  const mainItem = items.find((item) => item['line_number'] === 1)
  const freeItem = items.find((item) => item['line_number'] === 2)
  assert.ok(mainItem)
  assert.ok(freeItem)
  assert.equal(mainItem['quantity'], 498)
  assert.equal(mainItem['gross_weight'], 3973.56)
  assert.equal(mainItem['net_weight'], 3594.17)
  assert.equal(mainItem['customs_value'], 54467.73)
  assert.equal(mainItem['statistical_value'], 59564.42)
  assert.equal(freeItem['gtip_code'], '870829909000')
  assert.equal(freeItem['package_count'], 9)
  assert.equal(freeItem['customs_value'], 88.3)
  assert.equal(freeItem['statistical_value'], 96.56)
}

const tests = [
  testParsesDeclarationSummaryRow,
  testEnhancementRepairsMisreadGrossWeight,
  testEnhancementCapturesAnkaraDeclarationSignals,
  testWrappedGtipDeclarationLineIsReconstructed,
  testEvrimBeyannameLayoutExtractsCommonFields,
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
