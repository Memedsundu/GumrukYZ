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
  EXTRACTION_FILENAME_FIELD,
  FINAL_EXTRACTION_CONFIDENCE_FIELD,
  LOW_CONFIDENCE_THRESHOLD,
  NATIVE_TEXT_CONFIDENCE_FIELD,
  hasValue,
  isExtractionEmpty,
  reviewResult,
  toFiniteNumber,
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
  const filename = getStringSignal(doc.data, EXTRACTION_FILENAME_FIELD)
  return filename ? `${doc.docType} (${filename})` : `${doc.docType}`
}

function getStringSignal(data: Record<string, unknown>, field: string): string | null {
  const raw = data[field]
  if (!hasValue(raw)) return null
  return String(raw).trim()
}

function normalizedFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
}

function inferDocTypeFromFilename(filename: string): DocumentType | null {
  const normalized = normalizedFilename(filename)
  const base = normalized.split('/').pop() ?? normalized

  if (/\b(packing|ceki|paket|koli|ambalaj)\b/.test(base)) return DocumentType.PACKING_LIST
  if (/\b(yukleme|loading|talimat)\b/.test(base)) return DocumentType.LOADING_INSTRUCTION
  if (/\b(beyanname|declaration)\b/.test(base)) return DocumentType.DECLARATION_OUTPUT
  if (/\b(cmr|kon[sş]imento|konsimento|bill-of-lading|bill_of_lading|awb)\b/.test(base)) {
    return DocumentType.TRANSPORT_DOC
  }
  if (/\b(mense|origin|coo|atr|eur1)\b/.test(base)) return DocumentType.ORIGIN_DOC
  if (/\b(invoice|fatura)\b/.test(base) || /^fi\d{4,}/.test(base) || /^inv[-_\d]/.test(base)) {
    return DocumentType.INVOICE
  }

  return null
}

function formatConfidence(value: number): string {
  return `%${Math.round(value * 100)}`
}

function shouldFlagNativeConfidence(nativeConfidence: number | null, finalConfidence: number): boolean {
  if (nativeConfidence == null) return false
  if (nativeConfidence <= 0 && finalConfidence >= LOW_CONFIDENCE_THRESHOLD) return false
  return nativeConfidence < LOW_CONFIDENCE_THRESHOLD
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
  name: 'Belge türü veya dosya adı içerikle uyuşmuyor',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const mismatches: Array<{
      docType: string
      filename?: string
      expectedDocType?: string
      missing?: string[]
      reason: 'filename' | 'content'
    }> = []

    for (const doc of ctx.documents) {
      if (doc.confidence < LOW_CONFIDENCE_THRESHOLD) continue
      const data = doc.data as Record<string, unknown>
      const filename = getStringSignal(data, EXTRACTION_FILENAME_FIELD)
      const filenameDocType = filename ? inferDocTypeFromFilename(filename) : null
      if (filenameDocType && filenameDocType !== doc.docType) {
        mismatches.push({
          docType: doc.docType,
          filename: filename ?? undefined,
          expectedDocType: filenameDocType,
          reason: 'filename',
        })
      }

      const signals = DOC_TYPE_SIGNALS[doc.docType]
      if (!signals) continue
      if (isExtractionEmpty(doc)) continue // QUAL-001 handles this
      if (hasAnySignal(data, signals)) continue

      const populatedKeys = Object.keys(doc.data ?? {}).filter((key) =>
        !key.startsWith('_') && hasValue(data[key]),
      )
      if (populatedKeys.length < 2) continue
      mismatches.push({ docType: doc.docType, missing: signals.slice(0, 4), reason: 'content' })
    }

    if (mismatches.length === 0) return null

    const detail = mismatches
      .map((m) => {
        if (m.reason === 'filename') {
          return `${m.filename} dosya adı ${m.expectedDocType} izlenimi veriyor, içerik ${m.docType} olarak okundu`
        }
        return `${m.docType} (beklenen alanlar: ${m.missing?.join(', ')})`
      })
      .join('; ')

    return reviewResult(
      this.code,
      this.severity,
      `${mismatches.length} belgede tür/dosya adı uyumsuzluğu olabilir: ${detail}. Belge türünü ve dosya adını kontrol edin.`,
      mismatches.map((m) => ({
        docType: m.docType,
        field: m.reason === 'filename' ? EXTRACTION_FILENAME_FIELD : 'doc_type',
        value: m.filename,
      })),
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
    const lowDocs = ctx.documents.filter((d) => {
      const nativeConfidence = toFiniteNumber(d.data[NATIVE_TEXT_CONFIDENCE_FIELD])
      const finalConfidence =
        toFiniteNumber(d.data[FINAL_EXTRACTION_CONFIDENCE_FIELD]) ?? d.confidence
      return d.confidence < LOW_CONFIDENCE_THRESHOLD ||
        shouldFlagNativeConfidence(nativeConfidence, finalConfidence)
    })
    if (lowDocs.length === 0) return null
    const list = lowDocs
      .map((d) => {
        const filename = getStringSignal(d.data, EXTRACTION_FILENAME_FIELD)
        const nativeConfidence = toFiniteNumber(d.data[NATIVE_TEXT_CONFIDENCE_FIELD])
        const finalConfidence =
          toFiniteNumber(d.data[FINAL_EXTRACTION_CONFIDENCE_FIELD]) ?? d.confidence
        if (shouldFlagNativeConfidence(nativeConfidence, finalConfidence) && finalConfidence >= LOW_CONFIDENCE_THRESHOLD) {
          const displayNativeConfidence = nativeConfidence ?? d.confidence
          return `${filename ?? d.docType} (ilk okuma ${formatConfidence(displayNativeConfidence)}, son çıkarma ${formatConfidence(finalConfidence)})`
        }
        return `${filename ?? d.docType} (${formatConfidence(d.confidence)})`
      })
      .join(', ')
    return reviewResult(
      this.code,
      this.severity,
      `${lowDocs.length} belgede okuma/OCR kalitesi düşük görünüyor: ${list}. AI/OCR alanları toparlamış olsa bile kaynak belge ve kritik alanlar manuel doğrulanmalıdır.`,
      lowDocs.map((d) => {
        const finalConfidence =
          toFiniteNumber(d.data[FINAL_EXTRACTION_CONFIDENCE_FIELD]) ?? d.confidence
        const nativeConfidence = toFiniteNumber(d.data[NATIVE_TEXT_CONFIDENCE_FIELD])
        const useNativeConfidence = shouldFlagNativeConfidence(nativeConfidence, finalConfidence)
        return {
          docType: d.docType,
          field: useNativeConfidence
            ? NATIVE_TEXT_CONFIDENCE_FIELD
            : 'confidence',
          value: useNativeConfidence ? nativeConfidence : d.confidence,
        }
      }),
    )
  },
}
