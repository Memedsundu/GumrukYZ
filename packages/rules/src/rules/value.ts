import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import { failResult, findDocs, passResult, toFiniteNumber } from '../helpers.js'

const TOLERANCE = 0.005 // 0.5%

function withinTolerance(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true
  const base = Math.max(Math.abs(a), Math.abs(b))
  return Math.abs(a - b) / base <= TOLERANCE
}

type InvoiceItem = {
  quantity?: number | string
  unit_price?: number | string
  total_price?: number | string
  line_total?: number | string
  description?: string
}

function getLineTotal(item: InvoiceItem): number {
  return toFiniteNumber(item.total_price ?? item.line_total) ?? 0
}

/** VAL-001 — Tüm satır birim fiyatları pozitif olmalı. */
export const VAL_001: RuleDefinition = {
  code: 'VAL-001',
  name: 'Fatura birim fiyatları pozitif olmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = findDocs(ctx, DocumentType.INVOICE)
    if (invoices.length === 0) return null

    for (const inv of invoices) {
      const items = inv.data['items'] as InvoiceItem[] | undefined
      if (!items || items.length === 0) continue

      const badItems = items.filter((item) => {
        const price = toFiniteNumber(item.unit_price)
        return price == null || price <= 0
      })

      if (badItems.length > 0) {
        return failResult(
          this.code,
          this.severity,
          `${badItems.length} fatura satırında birim fiyat eksik veya pozitif değil. Alan: items[].unit_price.`,
          [{ docType: DocumentType.INVOICE, field: 'items[].unit_price' }],
        )
      }
    }

    return passResult(this.code, this.severity, 'Tüm fatura satır birim fiyatları pozitif.')
  },
}

/** VAL-002 — Satır toplamı = miktar × birim fiyat (±%0,5). */
export const VAL_002: RuleDefinition = {
  code: 'VAL-002',
  name: 'Fatura satır toplamı miktar × birim fiyat ile eşleşmeli',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = findDocs(ctx, DocumentType.INVOICE)
    if (invoices.length === 0) return null

    for (const inv of invoices) {
      const items = inv.data['items'] as InvoiceItem[] | undefined
      if (!items || items.length === 0) continue

      const mismatchLines: number[] = []
      items.forEach((item, idx) => {
        const qty = toFiniteNumber(item.quantity) ?? 0
        const price = toFiniteNumber(item.unit_price) ?? 0
        const lineTotal = getLineTotal(item)

        if (qty === 0 || price === 0 || lineTotal === 0) return

        const expected = qty * price
        if (!withinTolerance(expected, lineTotal)) {
          mismatchLines.push(idx + 1)
        }
      })

      if (mismatchLines.length > 0) {
        return failResult(
          this.code,
          this.severity,
          `Fatura satır toplamı uyuşmazlığı (satır ${mismatchLines.join(', ')}): total_price ≠ quantity × unit_price (tolerans ±%0,5).`,
          [{ docType: DocumentType.INVOICE, field: 'items[].total_price' }],
        )
      }
    }

    return passResult(
      this.code,
      this.severity,
      'Tüm fatura satır toplamları miktar × birim fiyat ile eşleşiyor.',
    )
  },
}

/** VAL-003 — Toplam tutar = satır toplamları (±%0,5). */
export const VAL_003: RuleDefinition = {
  code: 'VAL-003',
  name: 'Fatura toplamı satır toplamlarının toplamına eşit olmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = findDocs(ctx, DocumentType.INVOICE)
    if (invoices.length === 0) return null

    for (const inv of invoices) {
      const invoiceTotal = toFiniteNumber(inv.data['total_amount']) ?? 0
      if (invoiceTotal === 0) continue

      const items = inv.data['items'] as InvoiceItem[] | undefined
      if (!items || items.length === 0) continue

      const lineSum = items.reduce((sum, item) => sum + getLineTotal(item), 0)
      if (lineSum === 0) continue

      if (!withinTolerance(invoiceTotal, lineSum)) {
        return failResult(
          this.code,
          this.severity,
          `Fatura toplamı (${invoiceTotal}) satır toplamları (${lineSum.toFixed(2)}) ile ±%0,5'ten fazla farklı. Alanlar: total_amount, items[].total_price.`,
          [
            { docType: DocumentType.INVOICE, field: 'total_amount', value: invoiceTotal },
            { docType: DocumentType.INVOICE, field: 'items[].total_price', value: lineSum },
          ],
        )
      }
    }

    return passResult(this.code, this.severity, 'Fatura toplamı satır toplamlarına eşit.')
  },
}
