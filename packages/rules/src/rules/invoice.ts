import { DocumentType, RuleSeverity, isValidCurrency, isValidIncoterm } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

function getInvoices(ctx: SubmissionContext) {
  return ctx.documents.filter((d) => d.docType === DocumentType.INVOICE)
}

function makeResult(
  code: string,
  severity: RuleSeverity,
  pass: boolean,
  passMsg: string,
  failMsg: string,
  refs: Array<{ docType?: string; field?: string; value?: unknown }> = [],
): RuleEvaluationResult {
  return {
    ruleCode: code,
    severity,
    result: pass ? 'PASS' : severity === RuleSeverity.ERROR ? 'FAIL' : 'WARN',
    message: pass ? passMsg : failMsg,
    sourceRefs: pass ? [] : refs,
  }
}

export const INV_001: RuleDefinition = {
  code: 'INV-001',
  name: 'Invoice number must be present',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null
    const allHave = invoices.every(
      (inv) => inv.data['invoice_number'] && String(inv.data['invoice_number']).trim() !== '',
    )
    return makeResult(
      this.code,
      this.severity,
      allHave,
      'Invoice number present.',
      'Invoice number is missing. Field: invoice_number.',
      [{ docType: DocumentType.INVOICE, field: 'invoice_number' }],
    )
  },
}

export const INV_002: RuleDefinition = {
  code: 'INV-002',
  name: 'Invoice date must be valid',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const allValid = invoices.every((inv) => {
      const rawDate = inv.data['invoice_date']
      if (!rawDate) return false
      const parsed = new Date(String(rawDate))
      if (isNaN(parsed.getTime())) return false
      return parsed <= new Date()
    })

    return makeResult(
      this.code,
      this.severity,
      allValid,
      'Invoice date is valid.',
      'Invoice date is missing, unparseable, or in the future. Field: invoice_date.',
      [{ docType: DocumentType.INVOICE, field: 'invoice_date' }],
    )
  },
}

export const INV_003: RuleDefinition = {
  code: 'INV-003',
  name: 'Seller and buyer must be identified',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const allValid = invoices.every(
      (inv) =>
        inv.data['seller_name'] &&
        String(inv.data['seller_name']).trim() !== '' &&
        inv.data['buyer_name'] &&
        String(inv.data['buyer_name']).trim() !== '',
    )

    return makeResult(
      this.code,
      this.severity,
      allValid,
      'Seller and buyer identified.',
      'Seller or buyer name is missing. Fields: seller_name, buyer_name.',
      [
        { docType: DocumentType.INVOICE, field: 'seller_name' },
        { docType: DocumentType.INVOICE, field: 'buyer_name' },
      ],
    )
  },
}

export const INV_004: RuleDefinition = {
  code: 'INV-004',
  name: 'Currency must be valid ISO 4217',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const invalid = invoices.filter(
      (inv) => inv.data['currency'] && !isValidCurrency(String(inv.data['currency'])),
    )

    if (invalid.length === 0) {
      return makeResult(this.code, this.severity, true, 'Currency is valid.', '')
    }

    const badValues = invalid.map((inv) => inv.data['currency']).join(', ')
    return makeResult(
      this.code,
      this.severity,
      false,
      '',
      `Currency code(s) "${badValues}" are not valid ISO 4217 codes. Field: currency.`,
      [{ docType: DocumentType.INVOICE, field: 'currency', value: badValues }],
    )
  },
}

export const INV_005: RuleDefinition = {
  code: 'INV-005',
  name: 'Total amount must be positive',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const allPositive = invoices.every((inv) => {
      const amt = inv.data['total_amount']
      return amt != null && Number(amt) > 0
    })

    return makeResult(
      this.code,
      this.severity,
      allPositive,
      'Total amount is positive.',
      'Invoice total amount is missing or not a positive number. Field: total_amount.',
      [{ docType: DocumentType.INVOICE, field: 'total_amount' }],
    )
  },
}

export const INV_006: RuleDefinition = {
  code: 'INV-006',
  name: 'Incoterm must be a valid Incoterms 2020 term',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const invalid = invoices.filter(
      (inv) => inv.data['incoterm'] && !isValidIncoterm(String(inv.data['incoterm'])),
    )

    if (invalid.length === 0) {
      return makeResult(this.code, this.severity, true, 'Incoterm is valid or not specified.', '')
    }

    const badValues = invalid.map((inv) => inv.data['incoterm']).join(', ')
    return makeResult(
      this.code,
      this.severity,
      false,
      '',
      `Incoterm(s) "${badValues}" are not valid Incoterms 2020 terms. Field: incoterm.`,
      [{ docType: DocumentType.INVOICE, field: 'incoterm', value: badValues }],
    )
  },
}
