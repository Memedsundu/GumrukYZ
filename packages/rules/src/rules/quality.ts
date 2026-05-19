/**
 * QUAL-* rules — pre-flight extraction and quality checks that run before the
 * domain-specific rules. They flag conditions that would otherwise make every
 * downstream rule fail silently:
 *
 * - QUAL-001: Empty extraction — document uploaded but no fields could be read.
 * - QUAL-002: Wrong document type — content has none of the expected signals
 *             for the declared docType. Likely misclassification.
 * - QUAL-003: Duplicate content — multiple documents share the same business
 *             identifiers (eg same invoice number on two uploads).
 * - OCR-001:  One result per low-confidence document.
 */
import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type {
  ExtractionData,
  RuleDefinition,
  RuleEvaluationResult,
  SubmissionContext,
} from '../types.js'
import {
  LOW_CONFIDENCE_THRESHOLD,
  hasValue,
  isExtractionEmpty,
  reviewResult,
} from '../helpers.js'

/**
 * Per-doc signals: at least one of these fields must be present on a doc of
 * the matching type, otherwise QUAL-002 flags a likely misclassification.
 */
const DOC_TYPE_SIGNALS: Record<string, string[]> = {
  [DocumentType.INVOICE]: [
    'invoice_number',
    'total_amount',
    'items',
    'seller_name',
    'buyer_name',
  ],
  [DocumentType.PACKING_LIST]: [
    'package_count',
    'gross_weight',
    'net_weight',
    'items',
    'shipper',
    'consignee',
  ],
  [DocumentType.DECLARATION_OUTPUT]: [
    'declaration_number',
    'regime_code',
    'gtip_code',
    'customs_office_code',
  ],
  [DocumentType.TRANSPORT_DOC]: [
    'document_number',
    'bl_number',
    'shipper',
    'consignee',
    'departure',
    'destination',
  ],
  [DocumentType.BILL_OF_LADING]: ['bl_number', 'port_of_loading', 'port_of_discharge'],
  [DocumentType.AIRWAY_BILL]: ['awb_number', 'shipper', 'consignee'],
  [DocumentType.LOADING_INSTRUCTION]: ['shipper', 'consignee', 'delivery_address'],
  [DocumentType.ORIGIN_DOC]: ['country_of_origin', 'origin_country', 'issuing_authority'],
  [DocumentType.CERTIFICATE_OF_ORIGIN]: [
    'country_of_origin',
    'origin_country',
    'issuing_authority',
  ],
  [DocumentType.PERMIT_DOC]: ['permit_number', 'issuing_authority'],
}

function hasAnySignal(data: Record<string, unknown>, signals: string[]): boolean {
  return signals.some((field) => hasValue(data[field]))
}

function describeDoc(doc: ExtractionData): string {
  return `${doc.docType}`
}

/**
 * QUAL-001 — Belge yüklendi ama içerik okunamadı.
 * Never FAIL: this is almost always a quality/OCR issue, not a compliance error.
 */
export const QUAL_001: RuleDefinition = {
  code: 'QUAL-001',
  name: 'Belge içeriği boş — çıkarma başarısız',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const emptyDocs = ctx.documents.filter(
      (d) => d.docType !== DocumentType.UNCLASSIFIED && isExtractionEmpty(d),
    )
    if (emptyDocs.length === 0) return null
    const list = emptyDocs.map(describeDoc).join(', ')
    return reviewResult(
      this.code,
      this.severity,
      `${emptyDocs.length} belgeden veri çıkarılamadı (${list}). PDF'i yeniden yükleyin, daha yüksek çözünürlükle tarayın veya farklı bir formatta deneyin.`,
      emptyDocs.map((d) => ({ docType: d.docType, field: 'extraction', value: 'empty' })),
    )
  },
}

/**
 * QUAL-002 — Belge türü içerikle uyuşmuyor.
 * If a user uploaded a file as INVOICE but the extraction has no
 * invoice-like fields (and at least a few other fields), it's likely a
 * misclassification — surface as REVIEW_NEEDED, never as FAIL.
 */
export const QUAL_002: RuleDefinition = {
  code: 'QUAL-002',
  name: 'Belge türü içerikle uyuşmuyor',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const mismatches: Array<{ docType: string; missing: string[] }> = []

    for (const doc of ctx.documents) {
      if (doc.confidence < LOW_CONFIDENCE_THRESHOLD) continue
      const signals = DOC_TYPE_SIGNALS[doc.docType]
      if (!signals) continue
      if (isExtractionEmpty(doc)) continue // QUAL-001 handles this
      if (hasAnySignal(doc.data as Record<string, unknown>, signals)) continue

      const populatedKeys = Object.keys(doc.data ?? {}).filter((key) =>
        hasValue((doc.data as Record<string, unknown>)[key]),
      )
      if (populatedKeys.length < 2) continue
      mismatches.push({ docType: doc.docType, missing: signals.slice(0, 4) })
    }

    if (mismatches.length === 0) return null

    const detail = mismatches
      .map((m) => `${m.docType} (beklenen alanlar: ${m.missing.join(', ')})`)
      .join('; ')

    return reviewResult(
      this.code,
      this.severity,
      `${mismatches.length} belge yanlış türde sınıflandırılmış olabilir. Beklenen alanlar bulunamadı: ${detail}. Belge türlerini kontrol edin.`,
      mismatches.map((m) => ({ docType: m.docType, field: 'doc_type' })),
    )
  },
}

/**
 * QUAL-003 — Aynı iş numarası birden fazla belgede görülüyor.
 * Detects duplicate uploads where the same invoice_number / declaration_number
 * appears in multiple INVOICE / DECLARATION_OUTPUT documents.
 */
export const QUAL_003: RuleDefinition = {
  code: 'QUAL-003',
  name: 'Yinelenen belge tespit edildi',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const duplicates: Array<{ docType: string; field: string; value: string }> = []

    for (const docType of [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT]) {
      const field = docType === DocumentType.INVOICE ? 'invoice_number' : 'declaration_number'
      const docs = ctx.documents.filter((d) => d.docType === docType)
      if (docs.length < 2) continue

      const seen = new Map<string, number>()
      for (const doc of docs) {
        const raw = (doc.data as Record<string, unknown>)[field]
        if (!hasValue(raw)) continue
        const key = String(raw).trim().toUpperCase()
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }

      for (const [value, count] of seen.entries()) {
        if (count > 1) duplicates.push({ docType, field, value })
      }
    }

    if (duplicates.length === 0) return null

    const detail = duplicates
      .map((d) => `${d.docType} ${d.field}=${d.value} (${'x' + duplicates.filter((x) => x.value === d.value).length})`)
      .join('; ')

    return reviewResult(
      this.code,
      this.severity,
      `Aynı belge birden fazla yüklenmiş olabilir: ${detail}. Yinelenen yüklemeleri silin veya farklı belgeler olduklarını doğrulayın.`,
      duplicates.map((d) => ({ docType: d.docType, field: d.field, value: d.value })),
    )
  },
}

/**
 * OCR-001 — Belge çıkarma güveni düşük (per-doc).
 * Returns the first low-confidence doc as the result; the pipeline emits one
 * row per low-confidence doc separately (kept for backwards compatibility).
 * This rule definition lets the rule appear in documentation / DB metadata.
 */
export const OCR_001: RuleDefinition = {
  code: 'OCR-001',
  name: 'Belge çıkarma güveni düşük',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const lowDocs = ctx.documents.filter((d) => d.confidence < LOW_CONFIDENCE_THRESHOLD)
    if (lowDocs.length === 0) return null
    const list = lowDocs
      .map((d) => `${d.docType} (%${(d.confidence * 100).toFixed(0)})`)
      .join(', ')
    return reviewResult(
      this.code,
      this.severity,
      `${lowDocs.length} belge düşük güven skoru ile çıkarıldı: ${list}. Sonuçlar manuel olarak doğrulanmalıdır.`,
      lowDocs.map((d) => ({ docType: d.docType, field: 'confidence', value: d.confidence })),
    )
  },
}
