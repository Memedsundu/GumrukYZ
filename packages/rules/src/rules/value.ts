import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

const TOLERANCE = 0.005 // 0.5%

function withinTolerance(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true
  const base = Math.max(Math.abs(a), Math.abs(b))
  return Math.abs(a - b) / base <= TOLERANCE
}

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

type InvoiceItem = {
  quantity?: number | string
  unit_price?: number | string
  line_total?: number | string
  description?: string
}

/**
 * VAL-001 – Every invoice line item unit price must be positive.
 */
export const VAL_001: RuleDefinition = {
  code: 'VAL-001',
  name: 'Invoice unit prices must be positive',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = ctx.documents.filter((d) => d.docType === DocumentType.INVOICE)
    if (invoices.length === 0) return null

    for (const inv of invoices) {
      const items = inv.data['items'] as InvoiceItem[] | undefined
      if (!items || items.length === 0) continue

      const badItems = items.filter((item) => {
        const price = Number(item.unit_price ?? 0)
        return isNaN(price) || price <= 0
      })

      if (badItems.length > 0) {
        return fail(
          this.code,
          this.severity,
          `${badItems.length} invoice line item(s) have a missing or non-positive unit price. Field: items[].unit_price.`,
          [{ docType: DocumentType.INVOICE, field: 'items[].unit_price' }],
        )
      }
    }

    return pass(this.code, this.severity, 'All invoice line item unit prices are positive.')
  },
}

/**
 * VAL-002 – Line total must equal quantity × unit_price within 0.5% tolerance.
 */
export const VAL_002: RuleDefinition = {
  code: 'VAL-002',
  name: 'Invoice line total must match quantity × unit price',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = ctx.documents.filter((d) => d.docType === DocumentType.INVOICE)
    if (invoices.length === 0) return null

    for (const inv of invoices) {
      const items = inv.data['items'] as InvoiceItem[] | undefined
      if (!items || items.length === 0) continue

      const mismatchLines: number[] = []
      items.forEach((item, idx) => {
        const qty = Number(item.quantity ?? 0)
        const price = Number(item.unit_price ?? 0)
        const lineTotal = Number(item.line_total ?? 0)

        if (qty === 0 || price === 0 || lineTotal === 0) return

        const expected = qty * price
        if (!withinTolerance(expected, lineTotal)) {
          mismatchLines.push(idx + 1)
        }
      })

      if (mismatchLines.length > 0) {
        return fail(
          this.code,
          this.severity,
          `Line total mismatch on line(s) ${mismatchLines.join(', ')}: line_total ≠ quantity × unit_price (tolerance 0.5%).`,
          [{ docType: DocumentType.INVOICE, field: 'items[].line_total' }],
        )
      }
    }

    return pass(this.code, this.severity, 'All invoice line totals match quantity × unit price.')
  },
}

/**
 * VAL-003 – Invoice total_amount must equal the sum of all line item totals within 0.5%.
 */
export const VAL_003: RuleDefinition = {
  code: 'VAL-003',
  name: 'Invoice total must equal sum of line item totals',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = ctx.documents.filter((d) => d.docType === DocumentType.INVOICE)
    if (invoices.length === 0) return null

    for (const inv of invoices) {
      const invoiceTotal = Number(inv.data['total_amount'] ?? 0)
      if (invoiceTotal === 0) continue

      const items = inv.data['items'] as InvoiceItem[] | undefined
      if (!items || items.length === 0) continue

      const lineSum = items.reduce((sum, item) => {
        const lt = Number(item.line_total ?? 0)
        return sum + lt
      }, 0)

      if (lineSum === 0) continue

      if (!withinTolerance(invoiceTotal, lineSum)) {
        return fail(
          this.code,
          this.severity,
          `Invoice total (${invoiceTotal}) differs from sum of line totals (${lineSum.toFixed(2)}) by more than 0.5%. Fields: total_amount, items[].line_total.`,
          [
            { docType: DocumentType.INVOICE, field: 'total_amount', value: invoiceTotal },
            { docType: DocumentType.INVOICE, field: 'items[].line_total', value: lineSum },
          ],
        )
      }
    }

    return pass(this.code, this.severity, 'Invoice total matches sum of line item totals.')
  },
}
