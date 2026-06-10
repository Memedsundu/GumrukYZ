/**
 * Supplementary seed metadata per rule code.
 *
 * The executable registry (`ALL_RULES` in @gumrukyz/rules) is the single
 * source of truth for code, name, severity and appliesToDocTypes. This map
 * carries only the DB-side extras: Turkish description, checked fields,
 * the legal source title and fixture references.
 *
 * The seed throws when a code in ALL_RULES is missing here, so registry
 * parity is enforced at seed time.
 */

export const SOURCE_TITLES = {
  KANUN: '4458 Sayılı Gümrük Kanunu',
  YONETMELIK: 'Gümrük Yönetmeliği',
  INCOTERMS: 'ICC Incoterms 2020',
  TARIFE: 'Türk Gümrük Tarife Cetveli',
  FIATA: 'FIATA Bill of Lading Model Rules',
} as const

export type RuleSeedMetadata = {
  description: string
  fieldChecks: string[]
  sourceTitle: string | null
  fixturePassRef: string | null
  fixtureFailRef: string | null
}

const CLEAN_IMPORT = 'fixtures/clean-import/extraction.json'

export const RULE_SEED_METADATA: Record<string, RuleSeedMetadata> = {
  // ── Quality / extraction sanity ─────────────────────────────────────────
  'QUAL-001': {
    description: 'Yüklenen belgeden hiçbir alan okunamadı; belge kalitesi veya format sorunu olabilir.',
    fieldChecks: ['_final_extraction_confidence', '_extraction_method'],
    sourceTitle: null,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/qual-empty-extraction/extraction.json',
  },
  'QUAL-002': {
    description: 'Belge içeriği beyan edilen türle veya dosya adıyla uyuşmuyor olabilir; olası yanlış sınıflandırma.',
    fieldChecks: ['doc_type', '_filename'],
    sourceTitle: null,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/qual-doctype-mismatch/extraction.json',
  },
  'QUAL-003': {
    description: 'Aynı iş numarası (fatura/beyanname numarası) birden fazla belgede tespit edildi; olası yinelenen yükleme.',
    fieldChecks: ['invoice_number', 'declaration_number'],
    sourceTitle: null,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/qual-duplicate-invoice/extraction.json',
  },
  'OCR-001': {
    description: 'Belge okuma/OCR güveni düşük; kritik alanlar manuel doğrulanmalıdır.',
    fieldChecks: ['_native_text_confidence', '_final_extraction_confidence'],
    sourceTitle: null,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/low-confidence/extraction.json',
  },

  // ── Presence ────────────────────────────────────────────────────────────
  'PRES-001': {
    description: 'Her ithalat/ihracat dosyasında en az bir fatura bulunmalıdır.',
    fieldChecks: ['doc_type'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
  },
  'PRES-002': {
    description: 'İthalat dosyalarında en az bir çeki listesi bulunmalıdır.',
    fieldChecks: ['doc_type'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
  },
  'PRES-003': {
    description: 'İthalat dosyalarında konşimento veya taşıma belgesi bulunmalıdır.',
    fieldChecks: ['doc_type'],
    sourceTitle: SOURCE_TITLES.FIATA,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
  },
  'PRES-004': {
    description: 'Tercihli tarife talep edildiğinde (rejim kodu 4 ile başlıyorsa) menşe belgesi bulunmalıdır.',
    fieldChecks: ['doc_type', 'regime_code'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'PRES-005': {
    description: 'Bir dosyada en fazla bir beyanname çıktısı bulunmalıdır.',
    fieldChecks: ['doc_type'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },

  // ── Invoice mandatory fields ────────────────────────────────────────────
  'INV-001': {
    description: 'Faturada boş olmayan bir fatura numarası bulunmalıdır.',
    fieldChecks: ['invoice_number'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/medium-confidence-missing-field/extraction.json',
  },
  'INV-002': {
    description: 'Fatura tarihi geçerli olmalı ve gelecekte bir tarih olmamalıdır.',
    fieldChecks: ['invoice_date'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'INV-003': {
    description: 'Faturada hem satıcı hem alıcı adı bulunmalıdır.',
    fieldChecks: ['seller_name', 'buyer_name'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'INV-004': {
    description: 'Fatura para birimi geçerli bir ISO 4217 kodu olmalıdır.',
    fieldChecks: ['currency'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'INV-005': {
    description: 'Fatura toplam tutarı pozitif bir sayı olmalıdır.',
    fieldChecks: ['total_amount'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/value-mismatch/extraction.json',
  },
  'INV-006': {
    description: 'Incoterm belirtilmişse Incoterms 2020 terimlerinden biri olmalıdır.',
    fieldChecks: ['incoterm'],
    sourceTitle: SOURCE_TITLES.INCOTERMS,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },

  // ── Packing list ────────────────────────────────────────────────────────
  'PL-001': {
    description: 'Çeki listesinde pozitif tam sayı kap sayısı bulunmalıdır.',
    fieldChecks: ['package_count'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/weight-mismatch/extraction.json',
  },
  'PL-002': {
    description: 'Çeki listesinde pozitif brüt ağırlık bulunmalıdır.',
    fieldChecks: ['gross_weight'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/weight-mismatch/extraction.json',
  },

  // ── GTİP / HS code ──────────────────────────────────────────────────────
  'GTIP-001': {
    description: 'GTİP/HS kodu mevcutsa 8, 10 veya 12 haneli sayısal bir kod olmalıdır.',
    fieldChecks: ['gtip_code'],
    sourceTitle: SOURCE_TITLES.TARIFE,
    fixturePassRef: 'fixtures/gtip-prefix-compatible/extraction.json',
    fixtureFailRef: null,
  },
  'GTIP-002': {
    description: 'Beyanname satırlarında eşya tanımı boş bırakılamaz.',
    fieldChecks: ['goods_description'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'GTIP-003': {
    description: 'Fatura ve beyannamedeki GTİP kodları ön ek bazında uyumlu olmalıdır.',
    fieldChecks: ['gtip_code'],
    sourceTitle: SOURCE_TITLES.TARIFE,
    fixturePassRef: 'fixtures/gtip-prefix-compatible/extraction.json',
    fixtureFailRef: null,
  },

  // ── Cross-document consistency ──────────────────────────────────────────
  'CROSS-001': {
    description: 'Fatura toplam kıymeti ile beyanname toplam kıymeti %1 tolerans içinde uyumlu olmalıdır.',
    fieldChecks: ['total_amount', 'total_value'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/value-mismatch/extraction.json',
  },
  'CROSS-002': {
    description: 'Çeki listesi brüt ağırlığı ile beyanname brüt ağırlığı %1 tolerans içinde uyumlu olmalıdır.',
    fieldChecks: ['gross_weight', 'total_gross_weight'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/weight-mismatch/extraction.json',
  },
  'CROSS-003': {
    description: 'Fatura ve yükleme talimatındaki Incoterm bilgileri uyumlu olmalıdır.',
    fieldChecks: ['incoterm', 'delivery_term'],
    sourceTitle: SOURCE_TITLES.INCOTERMS,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'CROSS-004': {
    description: 'Fatura kalem miktarları ile çeki listesi miktarları karşılaştırılabilir birimlerde uyumlu olmalıdır.',
    fieldChecks: ['items[].quantity', 'package_count'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/ambiguous-quantity-unit/extraction.json',
  },
  'CROSS-005': {
    description: 'Fatura satıcısı ile yükleme talimatı göndericisi uyumlu olmalıdır.',
    fieldChecks: ['seller_name', 'shipper'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'CROSS-006': {
    description: 'Fatura ve çeki listesi net ağırlıkları %1 tolerans içinde uyumlu olmalıdır.',
    fieldChecks: ['net_weight'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/decimal-scale-net-weight/extraction.json',
  },
  'CROSS-007': {
    description: 'Fatura ve beyanname para birimleri aynı olmalıdır.',
    fieldChecks: ['currency'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'CROSS-008': {
    description: 'Çeki listesi kap sayısı beyanname kap sayısı ile aynı olmalıdır.',
    fieldChecks: ['package_count'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/weight-mismatch/extraction.json',
  },
  'CROSS-009': {
    description: 'Doğrulanan ticaret akışı (ithalat/ihracat) taraf ve güzergah kanıtlarıyla desteklenmelidir.',
    fieldChecks: ['seller_address', 'buyer_address', 'shipper', 'consignee', 'destination'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: 'fixtures/gtip-prefix-compatible/extraction.json',
    fixtureFailRef: null,
  },

  // ── Declaration ─────────────────────────────────────────────────────────
  'DECL-001': {
    description: 'Gümrük rejim kodu 4 haneli sayısal bir kod olmalıdır.',
    fieldChecks: ['regime_code'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'DECL-002': {
    description: 'Menşe ülke mevcut olmalı ve geçerli bir ISO 3166-1 alpha-2 koduna normalize edilebilmelidir.',
    fieldChecks: ['country_of_origin'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: 'fixtures/country-normalization/extraction.json',
    fixtureFailRef: null,
  },
  'DECL-003': {
    description: 'Beyannamede ithalatçı/ihracatçı vergi numarası bulunmalıdır.',
    fieldChecks: ['importer_tax_id', 'exporter_tax_id'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'DECL-004': {
    description: 'Beyanname tarihi gelecekte bir tarih olmamalıdır.',
    fieldChecks: ['declaration_date'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'DECL-005': {
    description: 'Beyannamede gümrük idaresi kodu bulunmalıdır.',
    fieldChecks: ['customs_office_code'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },

  // ── Bill of lading ──────────────────────────────────────────────────────
  'BL-001': {
    description: 'Konşimentoda boş olmayan bir konşimento numarası bulunmalıdır.',
    fieldChecks: ['bl_number'],
    sourceTitle: SOURCE_TITLES.FIATA,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'BL-002': {
    description: 'Konşimentoda yükleme ve boşaltma limanları bulunmalıdır.',
    fieldChecks: ['port_of_loading', 'port_of_discharge'],
    sourceTitle: SOURCE_TITLES.FIATA,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'BL-003': {
    description: 'Konşimento alıcısı (consignee) boş olmamalı ve fatura alıcısıyla uyumlu olmalıdır.',
    fieldChecks: ['consignee', 'buyer_name'],
    sourceTitle: SOURCE_TITLES.FIATA,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },

  // ── Certificate of origin ───────────────────────────────────────────────
  'COO-001': {
    description: 'Menşe şahadetnamesindeki menşe ülke fatura ile aynı olmalıdır.',
    fieldChecks: ['country_of_origin'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'COO-002': {
    description: 'Menşe belgesi düzenlenme tarihi fatura tarihinden sonra olmamalıdır.',
    fieldChecks: ['issue_date', 'invoice_date'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },
  'COO-003': {
    description: 'Menşe belgesinde düzenleyen makam bilgisi bulunmalıdır.',
    fieldChecks: ['issuing_authority'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: null,
  },

  // ── Value / arithmetic ──────────────────────────────────────────────────
  'VAL-001': {
    description: 'Fatura kalemlerinde birim fiyatlar pozitif olmalıdır.',
    fieldChecks: ['items[].unit_price'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/value-mismatch/extraction.json',
  },
  'VAL-002': {
    description: 'Kalem toplamı miktar × birim fiyata (%0,5 tolerans içinde) eşit olmalıdır.',
    fieldChecks: ['items[].total_price', 'items[].quantity', 'items[].unit_price'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/total-price-mismatch/extraction.json',
  },
  'VAL-003': {
    description: 'Fatura toplamı kalem toplamlarının toplamına (%0,5 tolerans içinde) eşit olmalıdır.',
    fieldChecks: ['total_amount', 'items[].total_price'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: CLEAN_IMPORT,
    fixtureFailRef: 'fixtures/total-price-mismatch/extraction.json',
  },

  // ── Export-specific ─────────────────────────────────────────────────────
  'EXP-001': {
    description: 'İhracat faturasında fatura numarası bulunmalıdır (Gümrük Yönetmeliği Madde 168).',
    fieldChecks: ['invoice_number'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: 'fixtures/sample-export-package-vs-item/extraction.json',
    fixtureFailRef: null,
  },
  'EXP-002': {
    description: 'İhracat faturasında satıcı/ihracatçı tanımlanmalıdır.',
    fieldChecks: ['seller_name'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: 'fixtures/sample-export-package-vs-item/extraction.json',
    fixtureFailRef: null,
  },
  'EXP-003': {
    description: 'İhracat beyannamesindeki rejim kodu geçerli bir ihracat rejimi ön eki taşımalıdır (10, 11, 21, 22, 23, 31).',
    fieldChecks: ['regime_code'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: 'fixtures/sample-export-package-vs-item/extraction.json',
    fixtureFailRef: null,
  },
  'EXP-004': {
    description: 'İhracat faturasında geçerli menşe ülke belirtilmelidir (tercihli tarife ve A.TR/EUR.1 beyanları için).',
    fieldChecks: ['country_of_origin'],
    sourceTitle: SOURCE_TITLES.KANUN,
    fixturePassRef: 'fixtures/sample-export-package-vs-item/extraction.json',
    fixtureFailRef: 'fixtures/export-origin-placeholder/extraction.json',
  },
  'EXP-005': {
    description: 'Geçici ihracat rejimlerinde (21/22) yükleme talimatı bulunmalıdır.',
    fieldChecks: ['regime_code', 'doc_type'],
    sourceTitle: SOURCE_TITLES.YONETMELIK,
    fixturePassRef: 'fixtures/sample-export-package-vs-item/extraction.json',
    fixtureFailRef: null,
  },
}
