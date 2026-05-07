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
