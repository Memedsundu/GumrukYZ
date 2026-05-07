import { DocumentType, RuleSeverity, isValidGtip } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

export const GTIP_002: RuleDefinition = {
  code: 'GTIP-002',
  name: 'Goods description must not be blank on declaration items',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const declarations = ctx.documents.filter(
      (d) => d.docType === DocumentType.DECLARATION_OUTPUT,
    )
    if (declarations.length === 0) return null

    const missing = declarations.filter(
      (d) =>
        !d.data['goods_description'] ||
        String(d.data['goods_description']).trim() === '',
    )

    if (missing.length === 0) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: 'Goods description is present on all declaration items.',
        sourceRefs: [],
      }
    }

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'FAIL',
      message:
        'Goods description is blank on one or more declaration line items. Field: goods_description.',
      sourceRefs: [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'goods_description' }],
    }
  },
}

export const GTIP_003: RuleDefinition = {
  code: 'GTIP-003',
  name: 'GTIP codes must be consistent across invoice and declaration',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const decl = ctx.documents.find((d) => d.docType === DocumentType.DECLARATION_OUTPUT)

    if (!invoice || !decl) return null

    const invGtip = invoice.data['gtip_code'] ? String(invoice.data['gtip_code']).trim() : null
    const declGtip = decl.data['gtip_code'] ? String(decl.data['gtip_code']).trim() : null

    if (!invGtip || !declGtip) return null

    if (invGtip === declGtip) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: `GTİP codes match (${invGtip}) between invoice and declaration.`,
        sourceRefs: [],
      }
    }

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'WARN',
      message: `GTİP code mismatch: invoice has "${invGtip}" but declaration has "${declGtip}". Please verify the correct HS classification.`,
      sourceRefs: [
        { docType: DocumentType.INVOICE, field: 'gtip_code', value: invGtip },
        { docType: DocumentType.DECLARATION_OUTPUT, field: 'gtip_code', value: declGtip },
      ],
    }
  },
}

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
