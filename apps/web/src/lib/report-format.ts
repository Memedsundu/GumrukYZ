export type SourceRef = {
  docType?: string
  field?: string
  value?: unknown
}

export {
  getRuleDisplayMetadata,
  recommendedActionForRuleResult,
  type RuleDisplayMetadata,
} from './rule-display-metadata'

export type RuleResultDisplayInput = {
  ruleCode: string
  result: string
  severity: string
  message?: string | null
  sourceRefsJson?: unknown
}

const DOC_TYPE_LABELS: Record<string, string> = {
  UNCLASSIFIED: 'Sınıflandırılmamış belge',
  INVOICE: 'Fatura',
  PACKING_LIST: 'Çeki listesi',
  LOADING_INSTRUCTION: 'Yükleme talimatı',
  TRANSPORT_DOC: 'Taşıma belgesi',
  DECLARATION_OUTPUT: 'Beyanname çıktısı',
  ORIGIN_DOC: 'Menşe belgesi',
  PERMIT_DOC: 'İzin/uygunluk belgesi',
  OTHER: 'Diğer belge',
  BILL_OF_LADING: 'Konşimento',
  AIRWAY_BILL: 'Hava yolu taşıma belgesi',
  CERTIFICATE_OF_ORIGIN: 'Menşe şahadetnamesi',
}

const FIELD_LABELS: Record<string, string> = {
  confidence: 'güven skoru',
  _filename: 'dosya adı',
  _native_text_confidence: 'ilk metin okuma güveni',
  _native_text_length: 'ilk metin uzunluğu',
  _final_extraction_confidence: 'son çıkarma güveni',
  _extraction_method: 'çıkarma yöntemi',
  doc_type: 'belge türü',
  invoice_number: 'fatura numarası',
  invoice_date: 'fatura tarihi',
  seller_name: 'satıcı adı',
  buyer_name: 'alıcı adı',
  currency: 'para birimi',
  total_amount: 'fatura toplamı',
  incoterm: 'Incoterm',
  package_count: 'kap sayısı',
  gross_weight: 'brüt ağırlık',
  net_weight: 'net ağırlık',
  goods_description: 'eşya tanımı',
  gtip_code: 'GTİP kodu',
  regime_code: 'rejim kodu',
  country_of_origin: 'menşe ülkesi',
  importer_tax_id: 'ithalatçı vergi numarası',
  exporter_tax_id: 'ihracatçı vergi numarası',
  declaration_date: 'beyanname tarihi',
  customs_office_code: 'gümrük idaresi kodu',
  document_number: 'belge numarası',
  departure: 'çıkış yeri',
  destination: 'varış yeri',
  consignee: 'alıcı/consignee',
  issuing_authority: 'düzenleyen makam',
  issue_date: 'düzenleme tarihi',
  'items[].unit_price': 'kalem birim fiyatı',
  'items[].total_price': 'kalem toplam fiyatı',
  total_value: 'beyan toplam kıymeti',
  total_gross_weight: 'beyan toplam brüt ağırlığı',
  'seller/buyer evidence': 'satıcı/alıcı yön kanıtı',
}

// Exported for the rule parity check (scripts/check-rule-parity.ts).
export const PASS_MESSAGES: Record<string, string> = {
  'PRES-001': 'Beklenen fatura belgesi mevcut.',
  'PRES-002': 'Beklenen çeki listesi mevcut.',
  'PRES-003': 'Beklenen taşıma belgesi mevcut.',
  'PRES-004': 'Tercihli tarife sinyali için beklenen menşe belgesi mevcut.',
  'PRES-005': 'Beklenen tek beyanname çıktısı mevcut.',
  'PRES-006': 'Beklenen yükleme talimatı mevcut.',
  'INV-001': 'Fatura numarası mevcut.',
  'INV-002': 'Fatura tarihi geçerli.',
  'INV-003': 'Satıcı ve alıcı bilgileri mevcut.',
  'INV-004': 'Para birimi kodu geçerli.',
  'INV-005': 'Fatura toplamı pozitif.',
  'INV-006': 'Incoterm geçerli veya belirtilmemiş.',
  'PL-001': 'Kap sayısı mevcut ve geçerli.',
  'PL-002': 'Brüt ağırlık mevcut.',
  'GTIP-001': 'GTİP kod formatı geçerli.',
  'GTIP-002': 'Eşya tanımı beyanname kalemlerinde mevcut.',
  'GTIP-003': 'Fatura ve beyanname GTİP bilgileri uyumlu.',
  'DECL-001': 'Rejim kodu geçerli.',
  'DECL-002': 'Menşe ülkesi bilgisi geçerli.',
  'DECL-003': 'İthalatçı vergi numarası beyannamede mevcut.',
  'DECL-004': 'Beyanname tarihi gelecekte değil.',
  'DECL-005': 'Gümrük idaresi kodu mevcut.',
  'BL-001': 'Taşıma belgesi numarası mevcut.',
  'BL-002': 'Yükleme ve boşaltma/varış alanları mevcut.',
  'BL-003': 'Taşıma belgesi alıcı bilgisi mevcut ve fatura alıcısı ile uyumlu görünüyor.',
  'COO-001': 'Menşe belgesi ve fatura menşe bilgileri uyumlu.',
  'COO-002': 'Menşe belgesi tarihi fatura tarihinden sonra değil.',
  'COO-003': 'Menşe belgesini düzenleyen makam mevcut.',
  'VAL-001': 'Fatura kalemlerinde birim fiyatlar pozitif.',
  'VAL-002': 'Fatura kalem toplamları miktar ve birim fiyat ile uyumlu.',
  'VAL-003': 'Fatura toplamı kalem toplamları ile uyumlu.',
  'CROSS-001': 'Fatura toplam kıymeti ile beyanname toplam kıymeti tolerans içinde uyumlu.',
  'CROSS-002': 'Çeki listesi brüt ağırlığı ile beyanname brüt ağırlığı uyumlu.',
  'CROSS-003': 'Fatura ve yükleme talimatı Incoterm bilgileri uyumlu.',
  'CROSS-004': 'Fatura kalem miktarları ile çeki listesi miktarları uyumlu.',
  'CROSS-005': 'Fatura satıcısı ile yükleme talimatı gönderici bilgisi uyumlu görünüyor.',
  'CROSS-006': 'Fatura ve çeki listesi net ağırlık bilgileri uyumlu.',
  'CROSS-007': 'Fatura ve beyanname para birimi uyumlu.',
  'CROSS-008': 'Çeki listesi ve beyanname kap sayısı uyumlu.',
  'CROSS-009': 'Beyan edilen ticaret akışı taraf ve güzergah verisiyle örtüşüyor.',
  'QUAL-001': 'Tüm belgelerden veri başarıyla çıkarıldı.',
  'QUAL-002': 'Belge türleri içerikleriyle örtüşüyor.',
  'QUAL-003': 'Yinelenen belge tespit edilmedi.',
  'EXP-001': 'İhracat fatura numarası mevcut.',
  'EXP-002': 'İhracatçı/satıcı bilgisi mevcut.',
  'EXP-003': 'İhracat rejim kodu geçerli.',
  'EXP-004': 'İhracat faturasında menşe bilgisi mevcut.',
  'EXP-005': 'Geçici ihracat için yükleme talimatı mevcut.',
}

// Exported for the rule parity check (scripts/check-rule-parity.ts).
export const ISSUE_MESSAGES: Record<string, string> = {
  'PRES-001': 'Beklenen fatura belgesi dosyada yok. Analiz mevcut belgelerle sınırlıdır.',
  'PRES-002': 'Beklenen çeki listesi dosyada yok. Analiz mevcut belgelerle sınırlıdır.',
  'PRES-003': 'Beklenen taşıma belgesi dosyada yok. Analiz mevcut belgelerle sınırlıdır.',
  'PRES-004': 'Tercihli tarife sinyali var ancak beklenen menşe belgesi dosyada yok. Analiz mevcut belgelerle sınırlıdır.',
  'PRES-005': 'Dosyada birden fazla beyanname çıktısı var. Bunun bilinçli olup olmadığı kontrol edilmeli.',
  'PRES-006': 'Beklenen yükleme talimatı dosyada yok. Analiz mevcut belgelerle sınırlıdır.',
  'INV-001': 'Fatura numarası eksik.',
  'INV-002': 'Fatura tarihi eksik, okunamadı veya gelecekte görünüyor.',
  'INV-003': 'Faturada satıcı veya alıcı bilgisi eksik.',
  'INV-004': 'Faturadaki para birimi ISO 4217 formatına uygun görünmüyor.',
  'INV-005': 'Fatura toplam tutarı eksik veya pozitif değil.',
  'INV-006': 'Faturadaki Incoterm geçerli Incoterms 2020 kodlarıyla uyumlu görünmüyor.',
  'PL-001': 'Çeki listesinde kap sayısı eksik veya geçerli pozitif tam sayı değil.',
  'PL-002': 'Çeki listesinde brüt ağırlık eksik, pozitif değil veya satır toplamlarıyla uyuşmuyor.',
  'GTIP-001': 'GTİP kodu 8 haneli sayısal formatta görünmüyor.',
  'GTIP-002': 'Beyanname kalemlerinde eşya tanımı eksik.',
  'GTIP-003': 'Fatura ve beyanname GTİP bilgileri farklı görünüyor. Sınıflandırma manuel doğrulanmalı.',
  'DECL-001': 'Beyannamede rejim kodu eksik veya 4 haneli sayısal formatta değil.',
  'DECL-002': 'Faturada menşe ülkesi eksik veya ISO 3166-1 alpha-2 formatına uygun değil.',
  'DECL-003': 'Beyannamede ithalatçı/ihracatçı vergi kimlik bilgisi eksik.',
  'DECL-004': 'Beyanname tarihi gelecekte görünüyor.',
  'DECL-005': 'Beyannamede gümrük idaresi kodu eksik.',
  'BL-001': 'Taşıma belgesi numarası eksik.',
  'BL-002': 'Taşıma belgesinde yükleme veya varış/boşaltma alanları eksik.',
  'BL-003': 'Taşıma belgesi alıcısı boş veya fatura alıcısıyla uyumlu görünmüyor.',
  'COO-001': 'Menşe belgesi ile faturadaki menşe ülkesi farklı görünüyor.',
  'COO-002': 'Menşe belgesi tarihi fatura tarihinden sonra görünüyor.',
  'COO-003': 'Menşe belgesinde düzenleyen makam eksik.',
  'VAL-001': 'Fatura kalemlerinden bir veya daha fazlasında birim fiyat eksik veya pozitif değil.',
  'VAL-002': 'Fatura kalem toplamı, miktar x birim fiyat hesabıyla uyumlu değil.',
  'VAL-003': 'Fatura toplamı, kalem toplamlarının toplamıyla uyumlu değil.',
  'CROSS-001': 'Fatura toplam kıymeti ile beyanname toplam kıymeti tolerans dışında farklı.',
  'CROSS-002': 'Çeki listesi brüt ağırlığı ile beyanname brüt ağırlığı tolerans dışında farklı.',
  'CROSS-003': 'Fatura ve yükleme talimatı Incoterm bilgileri farklı.',
  'CROSS-004': 'Fatura kalem miktarları ile çeki listesi miktarları uyumlu görünmüyor.',
  'CROSS-005': 'Fatura satıcısı ile yükleme talimatı gönderici bilgisi uyumlu görünmüyor.',
  'CROSS-006': 'Fatura ve çeki listesi net ağırlık bilgileri tolerans dışında farklı.',
  'CROSS-007': 'Fatura ve beyanname para birimi farklı.',
  'CROSS-008': 'Çeki listesi kap sayısı ile beyanname kap sayısı farklı.',
  'CROSS-009': 'Beyan edilen ticaret akışı taraf veya güzergah verisiyle çelişebilir; manuel doğrulama önerilir.',
  'QUAL-001': 'Belgeden veri çıkarılamadı (içerik boş). Belgeyi yeniden yükleyin veya farklı formatta deneyin.',
  'QUAL-002': 'Belge yüklenen türle örtüşmüyor; yanlış sınıflandırma olabilir.',
  'QUAL-003': 'Aynı belge birden fazla yüklenmiş olabilir; yinelenen yüklemeleri kontrol edin.',
  'EXP-001': 'İhracat faturasında fatura numarası eksik.',
  'EXP-002': 'İhracat faturası satıcı/ihracatçı bilgisi içermiyor.',
  'EXP-003': 'Beyannamedeki rejim kodu ihracat rejimleriyle uyumlu değil.',
  'EXP-004': 'İhracat faturasında menşe ülkesi eksik veya standart ülke adı olarak doğrulanamadı.',
  'EXP-005': 'Geçici ihracat için yükleme talimatı eksik.',
}

/**
 * Parses RiskReport.findingExplanationsJson into a findingId → explanation
 * map. Finding IDs are RuleResult row ids for deterministic findings and
 * `ai-rule:{ruleResultId}` for AI-rule findings (see processing.ts).
 */
export function parseFindingExplanations(value: unknown): Map<string, string> {
  const map = new Map<string, string>()
  if (!Array.isArray(value)) return map
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const { findingId, explanation } = entry as { findingId?: unknown; explanation?: unknown }
    if (typeof findingId === 'string' && typeof explanation === 'string' && explanation.trim().length > 0) {
      map.set(findingId, explanation)
    }
  }
  return map
}

export function parseSourceRefs(value: unknown): SourceRef[] {
  if (!Array.isArray(value)) return []
  return value.filter((ref): ref is SourceRef => Boolean(ref) && typeof ref === 'object')
}

export function docTypeLabel(docType?: string): string {
  if (!docType) return 'Belge'
  return DOC_TYPE_LABELS[docType] ?? docType
}

export function fieldLabel(field?: string): string {
  if (!field) return 'alan'
  return FIELD_LABELS[field] ?? field
}

export function resultLabel(result: string): string {
  const map: Record<string, string> = {
    PASS: 'Geçti',
    FAIL: 'Hata',
    WARN: 'Uyarı',
    REVIEW_NEEDED: 'İnceleme Gerekli',
    SKIP: 'Atlandı',
  }
  return map[result] ?? result
}

export function severityLabel(severity: string): string {
  const map: Record<string, string> = {
    ERROR: 'Kritik',
    WARNING: 'Uyarı',
    INFO: 'Bilgi',
  }
  return map[severity] ?? severity
}

export function formatSourceRef(ref: SourceRef): string {
  const parts = []
  if (ref.docType) parts.push(docTypeLabel(ref.docType))
  if (ref.field) parts.push(fieldLabel(ref.field))
  if (ref.value !== undefined) parts.push(String(ref.value))
  return parts.join(' / ')
}

export function formatRuleResultMessage(result: RuleResultDisplayInput): string {
  const sourceRefs = parseSourceRefs(result.sourceRefsJson)

  // For OCR-001 and the QUAL-* family, the rule itself returns a detailed
  // Turkish message that already enumerates the affected documents — prefer it.
  if (
    result.ruleCode === 'OCR-001' ||
    result.ruleCode.startsWith('QUAL-')
  ) {
    if (result.message && result.message.trim().length > 0) {
      return result.message
    }
    if (result.ruleCode === 'OCR-001') {
      const ref = sourceRefs[0]
      const confidence = typeof ref?.value === 'number' ? ` (%${Math.round(ref.value * 100)})` : ''
      return `${docTypeLabel(ref?.docType)} için veri çıkarma güven skoru düşük${confidence}. OCR fallback yeterli sonuç üretmediyse belge manuel incelenmeli.`
    }
  }

  if (result.result === 'PASS') {
    return PASS_MESSAGES[result.ruleCode] ?? 'Kontrol geçti.'
  }

  // The rule's own Turkish message interpolates the actual values it compared
  // (e.g. "Fatura tutarı (980) ↔ beyanname (98000)") and is therefore more
  // specific than the canned ISSUE_MESSAGES — prefer it for every non-PASS
  // outcome and fall back to the canned text only when a rule produced no
  // message.
  if (result.message && result.message.trim().length > 0) {
    return result.message
  }

  return ISSUE_MESSAGES[result.ruleCode] ?? `${result.ruleCode} kontrolünde bulgu tespit edildi. Kaynak alanlar manuel kontrol edilmeli.`
}

export function reportFilename(title: string, extension: 'pdf' | 'json'): string {
  const safeTitle = title
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return `gumrukyz-risk-raporu-${safeTitle || 'dosya'}.${extension}`
}
