import { DocumentType, RuleSeverity, TradeFlow } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

export const PRES_001: RuleDefinition = {
  code: 'PRES-001',
  name: 'Invoice required for all submissions',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const hasInvoice = ctx.documents.some((d) => d.docType === DocumentType.INVOICE)
    if (hasInvoice) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: 'Invoice found.',
        sourceRefs: [],
      }
    }
    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'FAIL',
      message:
        'No invoice found in this submission. An invoice is mandatory for all import and export transactions.',
      sourceRefs: [{ field: 'doc_type', value: DocumentType.INVOICE }],
    }
  },
}

export const PRES_003: RuleDefinition = {
  code: 'PRES-003',
  name: 'Transport document required for maritime shipments',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.BILL_OF_LADING],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== TradeFlow.IMPORT) return null

    const hasBL = ctx.documents.some((d) => d.docType === DocumentType.BILL_OF_LADING)
    if (hasBL) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: 'Transport document (bill of lading) found.',
        sourceRefs: [],
      }
    }

    // Only warn if no transport document at all (could be airway bill, etc.)
    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'WARN',
      message:
        'No bill of lading found. A transport document (B/L or airway bill) is typically required for import transactions.',
      sourceRefs: [{ field: 'doc_type', value: DocumentType.BILL_OF_LADING }],
    }
  },
}

export const PRES_004: RuleDefinition = {
  code: 'PRES-004',
  name: 'Certificate of origin required if preferential tariff indicated',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.CERTIFICATE_OF_ORIGIN],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const snap = ctx.declarationSnapshot
    if (!snap) return null

    // Look for preferential tariff indicators: regime codes starting with IM4/4, or tariff preference flag
    const isPreferential =
      snap.regimeCode?.startsWith('4') ||
      ctx.documents.some((d) => d.data['tariff_preference'] === true)

    if (!isPreferential) return null

    const hasCOO = ctx.documents.some((d) => d.docType === DocumentType.CERTIFICATE_OF_ORIGIN)
    if (hasCOO) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: 'Certificate of origin found for preferential tariff claim.',
        sourceRefs: [],
      }
    }

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'WARN',
      message:
        'Preferential tariff appears to be claimed but no certificate of origin was found. Please attach the relevant certificate.',
      sourceRefs: [{ field: 'doc_type', value: DocumentType.CERTIFICATE_OF_ORIGIN }],
    }
  },
}

export const PRES_005: RuleDefinition = {
  code: 'PRES-005',
  name: 'At most one declaration output per submission',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const decls = ctx.documents.filter((d) => d.docType === DocumentType.DECLARATION_OUTPUT)
    if (decls.length <= 1) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: 'Single declaration output document found.',
        sourceRefs: [],
      }
    }
    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'WARN',
      message: `${decls.length} declaration output documents found. Verify this is intentional.`,
      sourceRefs: [],
    }
  },
}

export const PRES_002: RuleDefinition = {
  code: 'PRES-002',
  name: 'Packing list required for import',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== TradeFlow.IMPORT) return null
    const hasPackingList = ctx.documents.some((d) => d.docType === DocumentType.PACKING_LIST)
    if (hasPackingList) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: 'Packing list found.',
        sourceRefs: [],
      }
    }
    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'WARN',
      message: 'No packing list found. A packing list is required for import transactions.',
      sourceRefs: [{ field: 'doc_type', value: DocumentType.PACKING_LIST }],
    }
  },
}
