import type { IssueType, SuggestionLanguage, SuggestionType } from './types'

// ── Rule code → issue type ────────────────────────────────────────────────────

const EXACT_RULE_ISSUE: Record<string, IssueType> = {
  // GTİP
  'GTIP-001': 'gtip_risk',
  'GTIP-002': 'gtip_risk',
  'GTIP-003': 'gtip_risk',
  // Value / arithmetic
  'VAL-001': 'value_mismatch',
  'VAL-002': 'value_mismatch',
  'VAL-003': 'value_mismatch',
  'CROSS-001': 'value_mismatch',
  // Currency
  'INV-004': 'currency_issue',
  'CROSS-007': 'currency_issue',
  // Weight
  'CROSS-002': 'weight_mismatch',
  'CROSS-006': 'weight_mismatch',
  'PL-002': 'weight_mismatch',
  // Quantity / package counts
  'CROSS-004': 'quantity_mismatch',
  'CROSS-008': 'quantity_mismatch',
  // Origin
  'DECL-002': 'origin_issue',
  'COO-001': 'origin_issue',
  'COO-002': 'origin_issue',
  'COO-003': 'origin_issue',
  'EXP-004': 'origin_issue',
  // Regime
  'DECL-001': 'regime_risk',
  'EXP-003': 'regime_risk',
  // Cross-document reference consistency
  'CROSS-003': 'document_reference_mismatch',
  'CROSS-005': 'document_reference_mismatch',
  'CROSS-009': 'document_reference_mismatch',
  'BL-003': 'document_reference_mismatch',
  // OCR / extraction quality
  'OCR-001': 'ocr_uncertainty',
  'QUAL-001': 'ocr_uncertainty',
  'QUAL-002': 'technical_verification_needed',
  'QUAL-003': 'technical_verification_needed',
}

export function ruleCodeToIssueType(ruleCode: string): IssueType {
  const exact = EXACT_RULE_ISSUE[ruleCode]
  if (exact) return exact
  if (ruleCode.startsWith('PRES-')) return 'missing_document'
  if (ruleCode === 'EXP-001' || ruleCode === 'EXP-005') return 'missing_document'
  if (ruleCode.startsWith('GTIP-')) return 'gtip_risk'
  if (ruleCode.startsWith('COO-')) return 'origin_issue'
  if (ruleCode.startsWith('VAL-')) return 'value_mismatch'
  // INV-*, BL-*, DECL-*, EXP-* mandatory-field checks default to missing_field.
  return 'missing_field'
}

export function expertAreaToIssueType(area: string): IssueType {
  switch (area) {
    case 'GTIP_PLAUSIBILITY':
      return 'gtip_risk'
    case 'PERMIT_PRODUCT_CONTROL':
    case 'LEGAL_CONTEXT':
      return 'technical_verification_needed'
    case 'REGIME_CHOICE':
      return 'regime_risk'
    case 'VALUATION':
    case 'INCOTERM':
      return 'value_mismatch'
    case 'ORIGIN_PREFERENTIAL':
      return 'origin_issue'
    case 'DOCUMENT_CONSISTENCY':
      return 'document_reference_mismatch'
    default:
      return 'technical_verification_needed'
  }
}

// ── Missing-document human names ───────────────────────────────────────────────

const PRESENCE_DOC_NAMES: Record<string, { tr: string; en: string }> = {
  'PRES-001': { tr: 'Fatura', en: 'Invoice' },
  'PRES-002': { tr: 'Çeki listesi', en: 'Packing list' },
  'PRES-003': { tr: 'Taşıma belgesi', en: 'Transport document' },
  'PRES-004': { tr: 'Menşe belgesi', en: 'Certificate of origin' },
  'PRES-005': { tr: 'Tek beyanname', en: 'Single declaration' },
  'EXP-001': { tr: 'İhracat faturası', en: 'Export invoice' },
  'EXP-005': { tr: 'Geçici ihracat belgeleri', en: 'Temporary export documents' },
}

export function presenceDocName(ruleCode: string, language: SuggestionLanguage): string | null {
  const entry = PRESENCE_DOC_NAMES[ruleCode]
  return entry ? entry[language] : null
}

// ── Predefined chip templates (per issue type) ────────────────────────────────

interface ChipTemplate {
  label: string
  type: SuggestionType
  prompt: string
}

const ISSUE_CHIPS_TR: Record<IssueType, ChipTemplate> = {
  gtip_risk: {
    label: 'Bu GTİP riskini açıkla',
    type: 'explain_issue',
    prompt:
      'Bu dosyadaki GTİP riskini sade şekilde açıkla. Hangi belge ve alanlara dayandığını göster. Kesin karar verme; gümrük müşavirinin kontrol etmesi gereken teknik noktaları listele.',
  },
  technical_verification_needed: {
    label: 'Hangi teknik bilgi gerekli?',
    type: 'checklist',
    prompt:
      'Bu ürün için GTİP veya teknik doğrulama açısından hangi ek bilgiler gerekli? Teknik çizim, malzeme, kullanım amacı, katalog veya ürün açıklaması gibi ihtiyaçları listele.',
  },
  value_mismatch: {
    label: 'Kıymet uyumsuzluğunu göster',
    type: 'compare_documents',
    prompt:
      'Fatura, beyanname ve diğer belgeler arasındaki kıymet uyumsuzluğunu göster. Hangi alanlarda fark olduğunu ve kullanıcının neyi kontrol etmesi gerektiğini açıkla.',
  },
  weight_mismatch: {
    label: 'Ağırlık farkını göster',
    type: 'compare_documents',
    prompt:
      'Çeki listesi, taşıma belgesi ve beyanname arasındaki brüt/net ağırlık farklarını göster. Hangi değerlerin çeliştiğini ve hangi belgenin kontrol edilmesi gerektiğini açıkla.',
  },
  origin_issue: {
    label: 'Menşe riskini açıkla',
    type: 'explain_issue',
    prompt:
      'Bu dosyadaki menşe veya tercihli menşe riskini açıkla. Hangi belgelerin eksik veya tutarsız olduğunu göster. Kesin hüküm verme; kontrol edilmesi gereken noktaları belirt.',
  },
  missing_document: {
    label: 'Eksik belgeleri listele',
    type: 'checklist',
    prompt:
      'Bu dosyada eksik görünen belgeleri listele. Her belge için neden gerekli olabileceğini kısa şekilde açıkla.',
  },
  missing_field: {
    label: 'Eksik alanları göster',
    type: 'show_evidence',
    prompt:
      'Bu dosyada eksik veya doldurulmamış alanları göster. Her alan için belge, sayfa ve kontrol önerisini belirt.',
  },
  document_reference_mismatch: {
    label: 'Referans uyumsuzluğunu göster',
    type: 'compare_documents',
    prompt:
      'Belge numarası, tarih, taşıma referansı veya fatura referansı gibi alanlardaki uyumsuzlukları göster. Hangi belgelerin birbiriyle çeliştiğini açıkla.',
  },
  ocr_uncertainty: {
    label: 'OCR belirsizliklerini göster',
    type: 'show_evidence',
    prompt:
      'OCR tarafından belirsiz okunan alanları göster. Bu alanların neden manuel kontrol edilmesi gerektiğini kısa şekilde açıkla.',
  },
  regime_risk: {
    label: 'Rejim riskini açıkla',
    type: 'explain_issue',
    prompt:
      'Bu dosyadaki gümrük rejimiyle ilgili olası riski açıkla. Hangi alanların ve belgelerin kontrol edilmesi gerektiğini belirt.',
  },
  quantity_mismatch: {
    label: 'Miktar farkını göster',
    type: 'compare_documents',
    prompt:
      'Fatura, çeki listesi ve beyanname arasındaki miktar farklarını göster. Hangi kalemlerde fark olduğunu ve kullanıcının neyi kontrol etmesi gerektiğini açıkla.',
  },
  currency_issue: {
    label: 'Para birimi sorununu açıkla',
    type: 'explain_issue',
    prompt:
      'Bu dosyadaki para birimi, kur veya kıymet hesaplama riskini açıkla. Hangi belge ve alanların kontrol edilmesi gerektiğini belirt.',
  },
}

const ISSUE_CHIPS_EN: Record<IssueType, ChipTemplate> = {
  gtip_risk: {
    label: 'Explain this GTİP risk',
    type: 'explain_issue',
    prompt:
      'Explain the GTİP/HS classification risk in this file in plain terms. Show which documents and fields it is based on. Do not decide; list the technical points the customs broker should verify.',
  },
  technical_verification_needed: {
    label: 'What technical info is needed?',
    type: 'checklist',
    prompt:
      'List the additional information needed to verify the GTİP or technical classification for this product (technical drawing, material, intended use, catalogue, product description).',
  },
  value_mismatch: {
    label: 'Show the value mismatch',
    type: 'compare_documents',
    prompt:
      'Show the customs value inconsistency between the invoice, declaration and other documents. Explain which fields differ and what the user should check.',
  },
  weight_mismatch: {
    label: 'Show the weight difference',
    type: 'compare_documents',
    prompt:
      'Show the gross/net weight differences between the packing list, transport document and declaration. Explain which values conflict and which document should be checked.',
  },
  origin_issue: {
    label: 'Explain the origin risk',
    type: 'explain_issue',
    prompt:
      'Explain the origin / preferential-origin risk in this file. Show which documents are missing or inconsistent. Do not rule; list the points to verify.',
  },
  missing_document: {
    label: 'List missing documents',
    type: 'checklist',
    prompt:
      'List the documents that appear to be missing in this file. Briefly explain why each may be required.',
  },
  missing_field: {
    label: 'Show missing fields',
    type: 'show_evidence',
    prompt:
      'Show the missing or unfilled fields in this file. For each field, indicate the document, page and a check suggestion.',
  },
  document_reference_mismatch: {
    label: 'Show the reference mismatch',
    type: 'compare_documents',
    prompt:
      'Show inconsistencies in fields like document number, date, transport reference or invoice reference. Explain which documents conflict.',
  },
  ocr_uncertainty: {
    label: 'Show uncertain OCR fields',
    type: 'show_evidence',
    prompt:
      'Show the fields read with low OCR confidence. Briefly explain why these fields should be checked manually.',
  },
  regime_risk: {
    label: 'Explain the regime risk',
    type: 'explain_issue',
    prompt:
      'Explain the possible customs-regime risk in this file. Indicate which fields and documents should be checked.',
  },
  quantity_mismatch: {
    label: 'Show the quantity difference',
    type: 'compare_documents',
    prompt:
      'Show the quantity differences between the invoice, packing list and declaration. Explain which line items differ and what the user should check.',
  },
  currency_issue: {
    label: 'Explain the currency issue',
    type: 'explain_issue',
    prompt:
      'Explain the currency, exchange-rate or value-calculation risk in this file. Indicate which documents and fields should be checked.',
  },
}

export function issueChipTemplate(issueType: IssueType, language: SuggestionLanguage): ChipTemplate {
  return (language === 'en' ? ISSUE_CHIPS_EN : ISSUE_CHIPS_TR)[issueType]
}

// ── General (non issue-specific) chips ────────────────────────────────────────

export type GeneralChipKind =
  | 'high_risk_summary'
  | 'manual_review'
  | 'importer_note'
  | 'clean_summary'
  | 'pre_submit_checklist'
  | 'internal_note'

const GENERAL_CHIPS_TR: Record<GeneralChipKind, ChipTemplate> = {
  high_risk_summary: {
    label: 'Yüksek risk özetini hazırla',
    type: 'summarize',
    prompt:
      'Bu dosyadaki yüksek riskli bulguları öncelik sırasına göre özetle. Her bulgu için belge kanıtı ve önerilen kontrol adımını ekle.',
  },
  manual_review: {
    label: 'Manuel inceleme öner',
    type: 'manual_review',
    prompt:
      'Bu dosyada neden manuel inceleme gerektiğini açıkla. En kritik bulguları ve brokerın karar vermeden önce kontrol etmesi gereken noktaları listele.',
  },
  importer_note: {
    label: 'İthalatçıya not hazırla',
    type: 'prepare_note',
    prompt:
      'Bu dosyadaki belirsizlikler için ithalatçıya gönderilecek kısa ve profesyonel bir açıklama/eksik bilgi talebi hazırla.',
  },
  clean_summary: {
    label: 'Temiz kontrol özeti hazırla',
    type: 'summarize',
    prompt:
      'Bu dosyada tespit edilen önemli bir risk olmadığını dikkatli bir dille özetle. Yine de son kontrol için brokerın bakması gereken temel alanları listele.',
  },
  pre_submit_checklist: {
    label: 'Gönderim öncesi kontrol listesi hazırla',
    type: 'checklist',
    prompt:
      'Beyan gönderimi öncesinde brokerın kontrol etmesi gereken temel noktaların kısa bir kontrol listesini hazırla.',
  },
  internal_note: {
    label: 'İç inceleme notu oluştur',
    type: 'prepare_note',
    prompt:
      'Bu dosya için kısa bir iç inceleme notu hazırla; yapılan kontrolleri ve brokerın dikkat etmesi gereken noktaları özetle.',
  },
}

const GENERAL_CHIPS_EN: Record<GeneralChipKind, ChipTemplate> = {
  high_risk_summary: {
    label: 'Summarize high-risk issues',
    type: 'summarize',
    prompt:
      'Summarize the high-risk findings in this file in priority order. For each finding add the document evidence and the suggested check step.',
  },
  manual_review: {
    label: 'Suggest manual review',
    type: 'manual_review',
    prompt:
      'Explain why this file needs manual review. List the most critical findings and the points the broker should check before deciding.',
  },
  importer_note: {
    label: 'Prepare a note for the importer',
    type: 'prepare_note',
    prompt:
      'Prepare a short, professional clarification / missing-information request to send to the importer about the uncertainties in this file.',
  },
  clean_summary: {
    label: 'Summarize clean review',
    type: 'summarize',
    prompt:
      'Summarize, with cautious wording, that no significant risk was detected in this file. Still list the key areas the broker should check before submission.',
  },
  pre_submit_checklist: {
    label: 'What to check before submission?',
    type: 'checklist',
    prompt:
      'Prepare a short checklist of the key points the broker should verify before submitting the declaration.',
  },
  internal_note: {
    label: 'Create internal review note',
    type: 'prepare_note',
    prompt:
      'Prepare a short internal review note for this file summarizing the checks performed and the points the broker should watch.',
  },
}

export function generalChipTemplate(
  kind: GeneralChipKind,
  language: SuggestionLanguage,
): ChipTemplate {
  return (language === 'en' ? GENERAL_CHIPS_EN : GENERAL_CHIPS_TR)[kind]
}
