import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

function getPackingLists(ctx: SubmissionContext) {
  return ctx.documents.filter((d) => d.docType === DocumentType.PACKING_LIST)
}

export const PL_001: RuleDefinition = {
  code: 'PL-001',
  name: 'Package count must be a positive integer',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const pls = getPackingLists(ctx)
    if (pls.length === 0) return null

    const allValid = pls.every((pl) => {
      const count = pl.data['package_count']
      return count != null && Number.isInteger(Number(count)) && Number(count) > 0
    })

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: allValid ? 'PASS' : 'FAIL',
      message: allValid
        ? 'Package count is present and valid.'
        : 'Package count is missing or not a positive integer. Field: package_count.',
      sourceRefs: allValid ? [] : [{ docType: DocumentType.PACKING_LIST, field: 'package_count' }],
    }
  },
}

export const PL_002: RuleDefinition = {
  code: 'PL-002',
  name: 'Gross weight must be present',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const pls = getPackingLists(ctx)
    if (pls.length === 0) return null

    const allValid = pls.every((pl) => {
      const weight = pl.data['gross_weight']
      return weight != null && Number(weight) > 0
    })

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: allValid ? 'PASS' : 'WARN',
      message: allValid
        ? 'Gross weight is present.'
        : 'Gross weight is missing or not a positive number. Field: gross_weight.',
      sourceRefs: allValid ? [] : [{ docType: DocumentType.PACKING_LIST, field: 'gross_weight' }],
    }
  },
}
