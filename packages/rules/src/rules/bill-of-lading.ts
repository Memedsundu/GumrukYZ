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

function getBLs(ctx: SubmissionContext) {
  return ctx.documents.filter((d) => {
    if (d.docType === DocumentType.BILL_OF_LADING) return true
    if (d.docType !== DocumentType.TRANSPORT_DOC) return false

    const documentType = String(d.data['document_type'] ?? '').toUpperCase()
    return (
      documentType.includes('B/L') ||
      documentType.includes('BILL OF LADING') ||
      documentType.includes('KONŞIMENTO') ||
      documentType.includes('KONSIMENTO')
    )
  })
}

function refDocType(docType: DocumentType): DocumentType {
  return docType
}

function textField(
  data: Record<string, unknown>,
  fields: string[],
): { field: string; value: string | null } {
  for (const field of fields) {
    const value = data[field]
    if (value != null && String(value).trim() !== '') {
      return { field, value: String(value).trim() }
    }
  }
  return { field: fields[0]!, value: null }
}

/** BL-001 – Bill of lading number must be present. */
export const BL_001: RuleDefinition = {
  code: 'BL-001',
  name: 'Bill of lading number must be present',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.TRANSPORT_DOC],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const bls = getBLs(ctx)
    if (bls.length === 0) return null

    const allHave = bls.every((bl) => textField(bl.data, ['bl_number', 'document_number']).value)
    if (allHave) return pass(this.code, this.severity, 'Bill of lading number is present.')
    return fail(
      this.code,
      this.severity,
      'Bill of lading number is missing. Field: document_number.',
      [{ docType: refDocType(bls[0]!.docType), field: 'document_number' }],
    )
  },
}

/** BL-002 – Port of loading and port of discharge must both be present. */
export const BL_002: RuleDefinition = {
  code: 'BL-002',
  name: 'Port of loading and discharge must be present',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.TRANSPORT_DOC],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const bls = getBLs(ctx)
    if (bls.length === 0) return null

    const missingPOL = bls.filter(
      (bl) => !textField(bl.data, ['port_of_loading', 'loading_port', 'departure']).value,
    )
    const missingPOD = bls.filter(
      (bl) => !textField(bl.data, ['port_of_discharge', 'discharge_port', 'destination']).value,
    )

    if (missingPOL.length === 0 && missingPOD.length === 0) {
      return pass(this.code, this.severity, 'Port of loading and discharge are both present.')
    }

    const missing: string[] = []
    if (missingPOL.length > 0) missing.push('departure/loading_port')
    if (missingPOD.length > 0) missing.push('destination/discharge_port')

    return fail(
      this.code,
      this.severity,
      `B/L is missing required port fields: ${missing.join(', ')}.`,
      missing.map((f) => ({ docType: refDocType(bls[0]!.docType), field: f })),
    )
  },
}

/** BL-003 – Consignee on the B/L must not be blank and should match the invoice buyer. */
export const BL_003: RuleDefinition = {
  code: 'BL-003',
  name: 'B/L consignee must be present and match invoice buyer',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.TRANSPORT_DOC, DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const bls = getBLs(ctx)
    if (bls.length === 0) return null

    const bl = bls[0]!
    const consignee = bl.data['consignee']
    if (!consignee || String(consignee).trim() === '') {
      return fail(
        this.code,
        this.severity,
        'Consignee field is blank on the bill of lading. Field: consignee.',
        [{ docType: refDocType(bl.docType), field: 'consignee' }],
      )
    }

    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice || !invoice.data['buyer_name']) {
      return pass(this.code, this.severity, 'B/L consignee is present (no invoice buyer to cross-check).')
    }

    const consigneeLower = String(consignee).toLowerCase()
    const buyerLower = String(invoice.data['buyer_name']).toLowerCase()

    const match = consigneeLower.includes(buyerLower) || buyerLower.includes(consigneeLower)
    if (match) return pass(this.code, this.severity, 'B/L consignee matches invoice buyer.')

    return fail(
      this.code,
      this.severity,
      `B/L consignee "${consignee}" may not match invoice buyer "${invoice.data['buyer_name']}". Please verify.`,
      [
        { docType: refDocType(bl.docType), field: 'consignee', value: consignee },
        { docType: DocumentType.INVOICE, field: 'buyer_name', value: invoice.data['buyer_name'] },
      ],
    )
  },
}
