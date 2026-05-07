import { DocumentType, RuleSeverity, isValidGtip } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

export const GTIP_001: RuleDefinition = {
  code: 'GTIP-001',
  name: 'GTİP code must be 8-digit numeric',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const declarations = ctx.documents.filter(
      (d) => d.docType === DocumentType.DECLARATION_OUTPUT,
    )

    // Also check declaration snapshot
    const snapGtip = ctx.declarationSnapshot?.gtipCode
    if (declarations.length === 0 && !snapGtip) return null

    const allCodes: string[] = []

    for (const decl of declarations) {
      const code = decl.data['gtip_code']
      if (code) allCodes.push(String(code))
    }
    if (snapGtip) allCodes.push(snapGtip)

    if (allCodes.length === 0) return null

    const invalidCodes = allCodes.filter((code) => !isValidGtip(code))

    if (invalidCodes.length === 0) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: 'GTİP code format is valid.',
        sourceRefs: [],
      }
    }

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'FAIL',
      message: `GTİP code(s) "${invalidCodes.join(', ')}" are not valid 8-digit HS codes. Field: gtip_code.`,
      sourceRefs: invalidCodes.map((c) => ({
        docType: DocumentType.DECLARATION_OUTPUT,
        field: 'gtip_code',
        value: c,
      })),
    }
  },
}
