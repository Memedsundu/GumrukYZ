/**
 * Export-specific rule set.
 *
 * These rules apply when tradeFlow === 'EXPORT'. They complement the cross-document
 * rules with Turkey-specific export control checks aligned with:
 * - 4458 Sayılı Gümrük Kanunu (Madde 161–194 ihracat hükümleri)
 * - Gümrük Yönetmeliği ihracat rejimleri
 * - Dış Ticaret Mevzuatı (İhracat Yönetmeliği)
 */
import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

/** Export invoices must have an invoice number */
export const EXP_001: RuleDefinition = {
  code: 'EXP-001',
  name: 'Export invoice must have invoice number',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice) return null

    const invoiceNumber = invoice.data['invoice_number']
    const pass = Boolean(invoiceNumber && String(invoiceNumber).trim().length > 0)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'FAIL',
      message: pass
        ? `Export invoice number present: ${invoiceNumber}.`
        : 'Export invoice must include an invoice number (Gümrük Yönetmeliği Madde 168).',
      sourceRefs: pass
        ? []
        : [{ docType: DocumentType.INVOICE, field: 'invoice_number', value: null }],
    }
  },
}

/** Export invoice must state the seller (exporter) name */
export const EXP_002: RuleDefinition = {
  code: 'EXP-002',
  name: 'Export invoice must identify the seller/exporter',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice) return null

    const seller = invoice.data['seller_name']
    const pass = Boolean(seller && String(seller).trim().length > 2)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'FAIL',
      message: pass
        ? `Exporter/seller identified: ${seller}.`
        : 'Export invoice must identify the seller/exporter (4458 Sayılı Gümrük Kanunu Madde 168).',
      sourceRefs: pass
        ? []
        : [{ docType: DocumentType.INVOICE, field: 'seller_name', value: null }],
    }
  },
}

/** Export declaration must state export regime code (typically 10xx or 21xx series) */
export const EXP_003: RuleDefinition = {
  code: 'EXP-003',
  name: 'Export declaration must have a valid export regime code',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const snap = ctx.declarationSnapshot
    if (!snap?.regimeCode) return null

    const regime = String(snap.regimeCode).trim()
    // Export regime codes: 10 (definitive), 11 (definitive + IPSS exit), 21 (temporary), 22 (re-export)
    const validExportPrefixes = ['10', '11', '21', '22', '23', '31']
    const pass = validExportPrefixes.some((prefix) => regime.startsWith(prefix))

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'WARN',
      message: pass
        ? `Export regime code "${regime}" is valid for export.`
        : `Regime code "${regime}" does not appear to be an export regime. Expected codes starting with: ${validExportPrefixes.join(', ')} (Gümrük Yönetmeliği ihracat rejimleri).`,
      sourceRefs: pass
        ? []
        : [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'regime_code', value: regime }],
    }
  },
}

/** Export invoice must specify country of origin (required for preferential origin) */
export const EXP_004: RuleDefinition = {
  code: 'EXP-004',
  name: 'Export invoice should specify country of origin',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice) return null

    const coo = invoice.data['country_of_origin']
    const pass = Boolean(coo && String(coo).trim().length >= 2)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'WARN',
      message: pass
        ? `Country of origin stated on invoice: ${coo}.`
        : 'Country of origin is missing from the export invoice. Required for preferential tariff treatments and A.TR/EUR.1 origin declarations.',
      sourceRefs: pass
        ? []
        : [{ docType: DocumentType.INVOICE, field: 'country_of_origin', value: null }],
    }
  },
}

/** Temporary export (regime 21) must have a loading instruction with return date intent */
export const EXP_005: RuleDefinition = {
  code: 'EXP-005',
  name: 'Temporary export must include a loading instruction document',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT, DocumentType.LOADING_INSTRUCTION],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const snap = ctx.declarationSnapshot
    if (!snap?.regimeCode) return null

    const regime = String(snap.regimeCode).trim()
    const isTemporaryExport = regime.startsWith('21') || regime.startsWith('22')
    if (!isTemporaryExport) return null

    const hasLoadingInstruction = ctx.documents.some(
      (d) => d.docType === DocumentType.LOADING_INSTRUCTION,
    )
    const pass = hasLoadingInstruction

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'WARN',
      message: pass
        ? 'Loading instruction present for temporary export.'
        : `Temporary export (regime ${regime}) should include a loading instruction. Ensures traceability and re-import compliance.`,
      sourceRefs: pass
        ? []
        : [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'regime_code', value: regime }],
    }
  },
}
