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
  return ctx.documents.filter((d) => d.docType === DocumentType.BILL_OF_LADING)
}

/** BL-001 – Bill of lading number must be present. */
export const BL_001: RuleDefinition = {
  code: 'BL-001',
  name: 'Bill of lading number must be present',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.BILL_OF_LADING],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const bls = getBLs(ctx)
    if (bls.length === 0) return null

    const allHave = bls.every(
      (bl) => bl.data['bl_number'] && String(bl.data['bl_number']).trim() !== '',
    )
    if (allHave) return pass(this.code, this.severity, 'Bill of lading number is present.')
    return fail(
      this.code,
      this.severity,
      'Bill of lading number is missing. Field: bl_number.',
      [{ docType: DocumentType.BILL_OF_LADING, field: 'bl_number' }],
    )
  },
}

/** BL-002 – Port of loading and port of discharge must both be present. */
export const BL_002: RuleDefinition = {
  code: 'BL-002',
  name: 'Port of loading and discharge must be present',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.BILL_OF_LADING],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const bls = getBLs(ctx)
    if (bls.length === 0) return null

    const missingPOL = bls.filter(
      (bl) => !bl.data['port_of_loading'] || String(bl.data['port_of_loading']).trim() === '',
    )
    const missingPOD = bls.filter(
      (bl) => !bl.data['port_of_discharge'] || String(bl.data['port_of_discharge']).trim() === '',
    )

    if (missingPOL.length === 0 && missingPOD.length === 0) {
      return pass(this.code, this.severity, 'Port of loading and discharge are both present.')
    }

    const missing: string[] = []
    if (missingPOL.length > 0) missing.push('port_of_loading')
    if (missingPOD.length > 0) missing.push('port_of_discharge')

    return fail(
      this.code,
      this.severity,
      `B/L is missing required port fields: ${missing.join(', ')}.`,
      missing.map((f) => ({ docType: DocumentType.BILL_OF_LADING, field: f })),
    )
  },
}

/** BL-003 – Consignee on the B/L must not be blank and should match the invoice buyer. */
export const BL_003: RuleDefinition = {
  code: 'BL-003',
  name: 'B/L consignee must be present and match invoice buyer',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.BILL_OF_LADING, DocumentType.INVOICE],

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
        [{ docType: DocumentType.BILL_OF_LADING, field: 'consignee' }],
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
        { docType: DocumentType.BILL_OF_LADING, field: 'consignee', value: consignee },
        { docType: DocumentType.INVOICE, field: 'buyer_name', value: invoice.data['buyer_name'] },
      ],
    )
  },
}
