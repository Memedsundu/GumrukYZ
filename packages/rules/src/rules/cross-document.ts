import { DocumentType, RuleSeverity, isValidIncoterm } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

const TOLERANCE = 0.01 // 1%

function withinTolerance(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true
  const base = Math.max(Math.abs(a), Math.abs(b))
  return Math.abs(a - b) / base <= TOLERANCE
}

export const CROSS_001: RuleDefinition = {
  code: 'CROSS-001',
  name: 'Invoice total value must match declaration total value',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const snap = ctx.declarationSnapshot

    if (!invoice || !snap) return null
    if (!invoice.data['total_amount'] || !snap.totalValue) return null

    const invAmt = Number(invoice.data['total_amount'])
    const declAmt = Number(snap.totalValue)

    const pass = withinTolerance(invAmt, declAmt)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'FAIL',
      message: pass
        ? `Invoice value (${invAmt}) matches declaration value (${declAmt}) within tolerance.`
        : `Invoice total value (${invAmt}) differs from declaration total value (${declAmt}) by more than 1%. Fields: invoice.total_amount, declaration.total_value.`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.INVOICE, field: 'total_amount', value: invAmt },
            { docType: DocumentType.DECLARATION_OUTPUT, field: 'total_value', value: declAmt },
          ],
    }
  },
}

export const CROSS_002: RuleDefinition = {
  code: 'CROSS-002',
  name: 'Packing list gross weight must match declaration gross weight',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.PACKING_LIST, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const pl = ctx.documents.find((d) => d.docType === DocumentType.PACKING_LIST)
    const snap = ctx.declarationSnapshot

    if (!pl || !snap) return null
    if (!pl.data['gross_weight'] || !snap.totalGrossWeight) return null

    const plWeight = Number(pl.data['gross_weight'])
    const declWeight = Number(snap.totalGrossWeight)

    const pass = withinTolerance(plWeight, declWeight)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'FAIL',
      message: pass
        ? `Packing list gross weight (${plWeight} kg) matches declaration gross weight (${declWeight} kg).`
        : `Packing list gross weight (${plWeight} kg) differs from declaration gross weight (${declWeight} kg) by more than 1%.`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.PACKING_LIST, field: 'gross_weight', value: plWeight },
            { docType: DocumentType.DECLARATION_OUTPUT, field: 'total_gross_weight', value: declWeight },
          ],
    }
  },
}

export const CROSS_003: RuleDefinition = {
  code: 'CROSS-003',
  name: 'Invoice incoterm must match loading instruction delivery term',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.LOADING_INSTRUCTION],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const loading = ctx.documents.find((d) => d.docType === DocumentType.LOADING_INSTRUCTION)

    if (!invoice || !loading) return null
    if (!invoice.data['incoterm'] || !loading.data['incoterm']) return null

    const invInco = String(invoice.data['incoterm']).toUpperCase().trim()
    const loadInco = String(loading.data['incoterm'] ?? loading.data['delivery_term'] ?? '').toUpperCase().trim()

    if (!invInco || !loadInco) return null

    const pass = invInco === loadInco

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'WARN',
      message: pass
        ? `Incoterm matches between invoice (${invInco}) and loading instruction (${loadInco}).`
        : `Incoterm mismatch: invoice says "${invInco}" but loading instruction says "${loadInco}".`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.INVOICE, field: 'incoterm', value: invInco },
            { docType: DocumentType.LOADING_INSTRUCTION, field: 'incoterm', value: loadInco },
          ],
    }
  },
}

export const CROSS_004: RuleDefinition = {
  code: 'CROSS-004',
  name: 'Invoice quantity must match declaration quantity',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const snap = ctx.declarationSnapshot

    if (!invoice || !snap) return null

    // Sum invoice item quantities
    const items = invoice.data['items'] as Array<{ quantity?: number }> | undefined
    if (!items || items.length === 0) return null

    const invTotalQty = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0)
    if (invTotalQty === 0) return null

    // Declaration items quantity - skip if not available
    return null // Cross-document quantity check requires declaration items, implemented in Phase 2
  },
}

export const CROSS_005: RuleDefinition = {
  code: 'CROSS-005',
  name: 'Seller in invoice must match shipper in loading instruction',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.LOADING_INSTRUCTION],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const loading = ctx.documents.find((d) => d.docType === DocumentType.LOADING_INSTRUCTION)

    if (!invoice || !loading) return null
    if (!invoice.data['seller_name'] || !loading.data['shipper']) return null

    const sellerName = String(invoice.data['seller_name']).toLowerCase().trim()
    const shipperName = String(loading.data['shipper']).toLowerCase().trim()

    // Fuzzy match: check if one contains the other (handles abbreviations)
    const pass = sellerName.includes(shipperName) || shipperName.includes(sellerName)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'WARN',
      message: pass
        ? 'Invoice seller matches loading instruction shipper.'
        : `Invoice seller "${invoice.data['seller_name']}" may not match loading instruction shipper "${loading.data['shipper']}".`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.INVOICE, field: 'seller_name', value: invoice.data['seller_name'] },
            { docType: DocumentType.LOADING_INSTRUCTION, field: 'shipper', value: loading.data['shipper'] },
          ],
    }
  },
}
