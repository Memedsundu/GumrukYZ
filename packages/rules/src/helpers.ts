/**
 * Shared rule helpers — confidence-aware result builders, Turkish messaging,
 * and field/value utilities.
 *
 * Production accuracy goals:
 * 1. Avoid hard FAIL on dubious extractions. If any source doc has medium
 *    confidence (between LOW and MEDIUM threshold), prefer REVIEW_NEEDED.
 * 2. Provide consistent Turkish messages for end users.
 * 3. Centralize value parsing so rules stay focused on domain logic.
 */
import type {
  ExtractionData,
  RuleEvaluationResult,
  SubmissionContext,
} from './types.js'
import { RuleSeverity } from '@gumrukyz/domain'

/** Below this, the pipeline excludes the document from content rules entirely. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5
/**
 * Between LOW and MEDIUM, the document is included but mandatory-field rules
 * downgrade to REVIEW_NEEDED instead of hard FAIL.
 */
export const MEDIUM_CONFIDENCE_THRESHOLD = 0.7

export const EXTRACTION_FILENAME_FIELD = '_filename'
export const NATIVE_TEXT_CONFIDENCE_FIELD = '_native_text_confidence'
export const NATIVE_TEXT_LENGTH_FIELD = '_native_text_length'
export const FINAL_EXTRACTION_CONFIDENCE_FIELD = '_final_extraction_confidence'
export const EXTRACTION_METHOD_FIELD = '_extraction_method'
export const PDF_IMAGE_COUNT_FIELD = '_pdf_image_count'
export const PDF_PAGES_WITH_IMAGES_FIELD = '_pdf_pages_with_images'
export const LIKELY_RASTER_SCAN_FIELD = '_likely_raster_scan'

export type SourceRef = NonNullable<RuleEvaluationResult['sourceRefs']>[number]

export function isLowConfidence(doc: ExtractionData | null | undefined): boolean {
  if (!doc) return false
  return doc.confidence < MEDIUM_CONFIDENCE_THRESHOLD
}

export function anyLowConfidence(
  docs: Array<ExtractionData | null | undefined>,
): boolean {
  return docs.some((d) => isLowConfidence(d))
}

export function passResult(
  code: string,
  severity: RuleSeverity,
  message: string,
): RuleEvaluationResult {
  return { ruleCode: code, severity, result: 'PASS', message, sourceRefs: [] }
}

export function failResult(
  code: string,
  severity: RuleSeverity,
  message: string,
  refs: SourceRef[] = [],
): RuleEvaluationResult {
  return {
    ruleCode: code,
    severity,
    result: severity === RuleSeverity.ERROR ? 'FAIL' : 'WARN',
    message,
    sourceRefs: refs,
  }
}

export function reviewResult(
  code: string,
  severity: RuleSeverity,
  message: string,
  refs: SourceRef[] = [],
): RuleEvaluationResult {
  return {
    ruleCode: code,
    severity,
    result: 'REVIEW_NEEDED',
    message,
    sourceRefs: refs,
  }
}

/**
 * Returns a hard FAIL/WARN when every source extraction is high-confidence,
 * otherwise returns REVIEW_NEEDED. Use this for mandatory-field checks so we
 * don't penalize the user for OCR noise.
 */
export function failOrReview(
  code: string,
  severity: RuleSeverity,
  sources: Array<ExtractionData | null | undefined>,
  failMessage: string,
  reviewMessage: string,
  refs: SourceRef[] = [],
): RuleEvaluationResult {
  if (anyLowConfidence(sources)) {
    return reviewResult(code, severity, reviewMessage, refs)
  }
  return failResult(code, severity, failMessage, refs)
}

/** True when value is present and non-empty (after string trimming). */
export function hasValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'number') return !Number.isNaN(value)
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function isPlaceholderValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'string') return false
  const normalized = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
  if (!normalized) return true
  return /^[:.;,\-–—_/\\]+$/.test(normalized) ||
    ['n/a', 'na', 'null', 'none', 'yok', 'belirsiz', 'okunamadi', 'okunamadi.'].includes(normalized)
}

export function normalizeCountryCode(raw: unknown): string | null {
  if (isPlaceholderValue(raw)) return null
  const value = String(raw ?? '').trim()
  if (!value) return null
  const upper = value.toUpperCase().replace(/\./g, '').trim()
  if (/^[A-Z]{2}$/.test(upper)) return upper
  const normalized = upper
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[İIı]/g, 'I')
    .replace(/[^A-Z]+/g, ' ')
    .trim()
  const aliases: Record<string, string> = {
    TURKIYE: 'TR',
    TURKEY: 'TR',
    'TURKIYE TURKEY': 'TR',
    'TURKEY TURKIYE': 'TR',
    'REPUBLIC OF TURKEY': 'TR',
    'TURKIYE CUMHURIYETI': 'TR',
    POLONYA: 'PL',
    POLAND: 'PL',
    ALMANYA: 'DE',
    GERMANY: 'DE',
    FRANSA: 'FR',
    FRANCE: 'FR',
    ITALYA: 'IT',
    ITALY: 'IT',
    ROMANYA: 'RO',
    ROMANIA: 'RO',
    BULGARISTAN: 'BG',
    BULGARIA: 'BG',
  }
  if (normalized.includes('TURKIYE') && normalized.includes('TURKEY')) return 'TR'
  return aliases[normalized] ?? null
}

/** Parse a flexible date string (dd-mm-yyyy, ISO, etc.) — null on failure. */
export function parseFlexibleDate(raw: unknown): Date | null {
  if (raw == null) return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  const value = String(raw).trim()
  if (!value) return null
  const dmy = value.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/)
  if (dmy) {
    const date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Coerce to finite number; returns null otherwise. */
export function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  const cleaned = value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\d,.\-+]/g, '')

  if (!cleaned || cleaned === '-' || cleaned === '+') return null

  const n = Number(normalizeNumericString(cleaned))
  return Number.isFinite(n) ? n : null
}

function normalizeNumericString(value: string): string {
  const lastComma = value.lastIndexOf(',')
  const lastDot = value.lastIndexOf('.')

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','
    return value
      .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.')
  }

  const separator = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : null
  if (!separator) return value

  const parts = value.split(separator)
  if (parts.length === 2) {
    const integerPart = parts[0] ?? ''
    const fractionalPart = parts[1] ?? ''
    if (fractionalPart.length === 0) return integerPart
    if (fractionalPart.length <= 2) return `${integerPart}.${fractionalPart}`
    if (fractionalPart.length === 3 && /^\d{1,3}$/.test(integerPart.replace(/^[+-]/, ''))) {
      return `${integerPart}${fractionalPart}`
    }
    return `${integerPart}.${fractionalPart}`
  }

  const lastPart = parts[parts.length - 1] ?? ''
  const leading = parts.slice(0, -1).join('')
  if (lastPart.length <= 2) return `${leading}.${lastPart}`
  return `${leading}${lastPart}`
}

/** Pick first present, non-empty string from a list of candidate fields. */
export function firstNonEmpty(
  data: Record<string, unknown>,
  fields: string[],
): { field: string; value: string } | null {
  for (const field of fields) {
    const raw = data[field]
    if (hasValue(raw)) {
      const value = typeof raw === 'string' ? raw.trim() : String(raw)
      if (value.length > 0) return { field, value }
    }
  }
  return null
}

/** True when extraction is essentially empty (all values null/empty). */
export function isExtractionEmpty(doc: ExtractionData): boolean {
  const data = doc.data
  if (!data || typeof data !== 'object') return true
  const keys = Object.keys(data).filter((key) => !key.startsWith('_'))
  if (keys.length === 0) return true
  return keys.every((key) => {
    const value = data[key]
    if (value == null) return true
    if (typeof value === 'string') return value.trim().length === 0
    if (Array.isArray(value)) return value.length === 0
    return false
  })
}

/** Find a single doc by type — convenience used in many rules. */
export function findDoc(
  ctx: SubmissionContext,
  docType: string,
): ExtractionData | undefined {
  return ctx.documents.find((d) => d.docType === docType)
}

/** Find all docs of a given type. */
export function findDocs(
  ctx: SubmissionContext,
  docType: string,
): ExtractionData[] {
  return ctx.documents.filter((d) => d.docType === docType)
}
