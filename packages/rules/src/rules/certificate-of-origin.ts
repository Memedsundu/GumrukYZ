import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import {
  failOrReview,
  failResult,
  hasValue,
  parseFlexibleDate,
  passResult,
} from '../helpers.js'

function getOriginDocs(ctx: SubmissionContext) {
  return ctx.documents.filter(
    (d) => d.docType === DocumentType.ORIGIN_DOC || d.docType === DocumentType.CERTIFICATE_OF_ORIGIN,
  )
}

function firstText(data: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = data[field]
    if (hasValue(value)) return String(value).trim()
  }
  return null
}

/** COO-001 — Menşe ülke fatura ve sertifikada eşleşmeli. */
export const COO_001: RuleDefinition = {
  code: 'COO-001',
  name: 'Menşe ülke fatura ile sertifikada eşleşmeli',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.ORIGIN_DOC, DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const coo = getOriginDocs(ctx)[0]
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!coo || !invoice) return null

    const cooCountry = firstText(coo.data, ['country_of_origin', 'origin_country'])
    const invCountry = firstText(invoice.data, ['country_of_origin', 'origin_country'])
    if (!cooCountry || !invCountry) return null

    const cooNorm = cooCountry.toUpperCase().trim()
    const invNorm = invCountry.toUpperCase().trim()

    if (cooNorm === invNorm) {
      return passResult(
        this.code,
        this.severity,
        `Menşe ülke "${cooNorm}" fatura ve sertifikada aynı.`,
      )
    }

    return failResult(
      this.code,
      this.severity,
      `Menşe ülke uyuşmazlığı: sertifika "${cooNorm}" ↔ fatura "${invNorm}".`,
      [
        { docType: coo.docType, field: 'origin_country', value: cooNorm },
        { docType: DocumentType.INVOICE, field: 'country_of_origin', value: invNorm },
      ],
    )
  },
}

/** COO-002 — Menşe sertifikası tarihi fatura tarihinden sonra olmamalı. */
export const COO_002: RuleDefinition = {
  code: 'COO-002',
  name: 'Menşe sertifikası tarihi fatura tarihinden sonra olmamalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.ORIGIN_DOC, DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const coo = getOriginDocs(ctx)[0]
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!coo || !invoice) return null

    const cooDateRaw = coo.data['issue_date'] ?? coo.data['certificate_date']
    const invDateRaw = invoice.data['invoice_date']
    if (!cooDateRaw || !invDateRaw) return null

    const cooDate = parseFlexibleDate(cooDateRaw)
    const invDate = parseFlexibleDate(invDateRaw)
    if (!cooDate || !invDate) return null

    if (cooDate <= invDate) {
      return passResult(
        this.code,
        this.severity,
        'Menşe sertifikası tarihi fatura tarihinden önce veya aynı tarihte.',
      )
    }

    return failResult(
      this.code,
      this.severity,
      `Menşe sertifikası tarihi (${cooDateRaw}) fatura tarihinden (${invDateRaw}) sonra. Uyum riski.`,
      [
        { docType: coo.docType, field: 'issue_date', value: String(cooDateRaw) },
        { docType: DocumentType.INVOICE, field: 'invoice_date', value: String(invDateRaw) },
      ],
    )
  },
}

/** COO-003 — Sertifikayı düzenleyen makam bulunmalı. */
export const COO_003: RuleDefinition = {
  code: 'COO-003',
  name: 'Menşe sertifikasında düzenleyen makam bulunmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.ORIGIN_DOC],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const coos = getOriginDocs(ctx)
    if (coos.length === 0) return null

    const missing = coos.filter((c) => !hasValue(c.data['issuing_authority']))
    if (missing.length === 0) {
      return passResult(this.code, this.severity, 'Menşe sertifikası düzenleyen makamı belirtilmiş.')
    }

    return failOrReview(
      this.code,
      this.severity,
      missing,
      'Menşe sertifikasında düzenleyen makam eksik. Alan: issuing_authority.',
      'Düzenleyen makam sertifikadan güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: coos[0]!.docType, field: 'issuing_authority' }],
    )
  },
}
