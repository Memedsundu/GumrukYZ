import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

function pass(code: string, severity: RuleSeverity, msg: string): RuleEvaluationResult {
  return { ruleCode: code, severity, result: 'PASS', message: msg, sourceRefs: [] }
}

function fail(
  code: string,
  severity: RuleSeverity,
  msg: string,
  refs: RuleEvaluationResult['sourceRefs'] = [],
): RuleEvaluationResult {
  return {
    ruleCode: code,
    severity,
    result: severity === RuleSeverity.ERROR ? 'FAIL' : 'WARN',
    message: msg,
    sourceRefs: refs,
  }
}

function getOriginDocs(ctx: SubmissionContext) {
  return ctx.documents.filter(
    (d) => d.docType === DocumentType.ORIGIN_DOC || d.docType === DocumentType.CERTIFICATE_OF_ORIGIN,
  )
}

function firstText(data: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = data[field]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }
  return null
}

/**
 * COO-001 – Country declared on the Certificate of Origin must match the
 * country_of_origin field on the invoice.
 */
export const COO_001: RuleDefinition = {
  code: 'COO-001',
  name: 'Certificate of origin country must match invoice country of origin',
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
      return pass(
        this.code,
        this.severity,
        `Country of origin "${cooNorm}" matches on both certificate and invoice.`,
      )
    }

    return fail(
      this.code,
      this.severity,
      `Country of origin mismatch: certificate says "${cooNorm}" but invoice says "${invNorm}".`,
      [
        { docType: coo.docType, field: 'origin_country', value: cooNorm },
        { docType: DocumentType.INVOICE, field: 'country_of_origin', value: invNorm },
      ],
    )
  },
}

/**
 * COO-002 – Certificate of origin issue date must be on or before the invoice date.
 * A certificate dated after the invoice is a common compliance red flag.
 */
export const COO_002: RuleDefinition = {
  code: 'COO-002',
  name: 'Certificate of origin date must not be after invoice date',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.ORIGIN_DOC, DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const coo = getOriginDocs(ctx)[0]
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)

    if (!coo || !invoice) return null

    const cooDateRaw = coo.data['issue_date'] ?? coo.data['certificate_date']
    const invDateRaw = invoice.data['invoice_date']

    if (!cooDateRaw || !invDateRaw) return null

    const cooDate = new Date(String(cooDateRaw))
    const invDate = new Date(String(invDateRaw))

    if (isNaN(cooDate.getTime()) || isNaN(invDate.getTime())) return null

    if (cooDate <= invDate) {
      return pass(
        this.code,
        this.severity,
        'Certificate of origin issue date is on or before the invoice date.',
      )
    }

    return fail(
      this.code,
      this.severity,
      `Certificate of origin issue date (${cooDateRaw}) is after the invoice date (${invDateRaw}), which may indicate a compliance issue.`,
      [
        { docType: coo.docType, field: 'issue_date', value: String(cooDateRaw) },
        { docType: DocumentType.INVOICE, field: 'invoice_date', value: String(invDateRaw) },
      ],
    )
  },
}

/**
 * COO-003 – Certificate of origin issuing authority must not be blank.
 */
export const COO_003: RuleDefinition = {
  code: 'COO-003',
  name: 'Certificate of origin issuing authority must be present',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.ORIGIN_DOC],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const coos = getOriginDocs(ctx)
    if (coos.length === 0) return null

    const missing = coos.filter(
      (c) =>
        !c.data['issuing_authority'] || String(c.data['issuing_authority']).trim() === '',
    )

    if (missing.length === 0) {
      return pass(this.code, this.severity, 'Certificate of origin issuing authority is present.')
    }

    return fail(
      this.code,
      this.severity,
      'Certificate of origin is missing the issuing authority. Field: issuing_authority.',
      [{ docType: coos[0]!.docType, field: 'issuing_authority' }],
    )
  },
}
