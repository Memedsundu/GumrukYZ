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

export const CROSS_006: RuleDefinition = {
  code: 'CROSS-006',
  name: 'Invoice net weight must match packing list net weight',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const pl = ctx.documents.find((d) => d.docType === DocumentType.PACKING_LIST)

    if (!invoice || !pl) return null
    if (!invoice.data['net_weight'] || !pl.data['net_weight']) return null

    const invWeight = Number(invoice.data['net_weight'])
    const plWeight = Number(pl.data['net_weight'])

    if (isNaN(invWeight) || isNaN(plWeight) || invWeight === 0 || plWeight === 0) return null

    const pass = withinTolerance(invWeight, plWeight)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'FAIL',
      message: pass
        ? `Net weight matches: invoice (${invWeight} kg) ≈ packing list (${plWeight} kg).`
        : `Net weight mismatch: invoice (${invWeight} kg) differs from packing list (${plWeight} kg) by more than 1%.`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.INVOICE, field: 'net_weight', value: invWeight },
            { docType: DocumentType.PACKING_LIST, field: 'net_weight', value: plWeight },
          ],
    }
  },
}

export const CROSS_007: RuleDefinition = {
  code: 'CROSS-007',
  name: 'Currency must match across invoice and declaration',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const snap = ctx.declarationSnapshot

    if (!invoice || !snap) return null
    if (!invoice.data['currency'] || !snap.currency) return null

    const invCcy = String(invoice.data['currency']).toUpperCase().trim()
    const declCcy = String(snap.currency).toUpperCase().trim()

    if (invCcy === declCcy) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: `Currency matches: invoice and declaration both use ${invCcy}.`,
        sourceRefs: [],
      }
    }

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'FAIL',
      message: `Currency mismatch: invoice uses "${invCcy}" but declaration uses "${declCcy}".`,
      sourceRefs: [
        { docType: DocumentType.INVOICE, field: 'currency', value: invCcy },
        { docType: DocumentType.DECLARATION_OUTPUT, field: 'currency', value: declCcy },
      ],
    }
  },
}

export const CROSS_008: RuleDefinition = {
  code: 'CROSS-008',
  name: 'Package count in packing list must match declaration',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.PACKING_LIST, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const pl = ctx.documents.find((d) => d.docType === DocumentType.PACKING_LIST)
    const snap = ctx.declarationSnapshot

    if (!pl || !snap) return null
    if (!pl.data['package_count'] || !snap.packageCount) return null

    const plCount = Number(pl.data['package_count'])
    const declCount = Number(snap.packageCount)

    if (isNaN(plCount) || isNaN(declCount)) return null

    if (plCount === declCount) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: `Package count matches: packing list and declaration both have ${plCount} packages.`,
        sourceRefs: [],
      }
    }

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'FAIL',
      message: `Package count mismatch: packing list has ${plCount} packages but declaration has ${declCount}.`,
      sourceRefs: [
        { docType: DocumentType.PACKING_LIST, field: 'package_count', value: plCount },
        { docType: DocumentType.DECLARATION_OUTPUT, field: 'package_count', value: declCount },
      ],
    }
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
