import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

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

/** DECL-001 – Rejim kodu (regime code) must be a 4-digit numeric string. */
export const DECL_001: RuleDefinition = {
  code: 'DECL-001',
  name: 'Regime code must be 4-digit numeric',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const snap = ctx.declarationSnapshot
    if (!snap) return null
    if (!snap.regimeCode) {
      return fail(
        this.code,
        this.severity,
        'Regime code (rejim kodu) is missing on the declaration. Field: regime_code.',
        [{ field: 'regime_code' }],
      )
    }
    const valid = /^\d{4}$/.test(snap.regimeCode)
    if (valid) return pass(this.code, this.severity, `Regime code "${snap.regimeCode}" is a valid 4-digit code.`)
    return fail(
      this.code,
      this.severity,
      `Regime code "${snap.regimeCode}" is not a valid 4-digit numeric code. Field: regime_code.`,
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'regime_code', value: snap.regimeCode }],
    )
  },
}

/** DECL-002 – Country of origin must be a 2-letter ISO 3166-1 alpha-2 code. */
export const DECL_002: RuleDefinition = {
  code: 'DECL-002',
  name: 'Country of origin must be present and valid',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT, DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice) return null
    const country = invoice.data['country_of_origin']
    if (!country) {
      return fail(
        this.code,
        this.severity,
        'Country of origin is missing on the invoice. Field: country_of_origin.',
        [{ docType: DocumentType.INVOICE, field: 'country_of_origin' }],
      )
    }
    const valid = /^[A-Z]{2}$/.test(String(country).toUpperCase().trim())
    if (valid) return pass(this.code, this.severity, `Country of origin "${country}" is valid.`)
    return fail(
      this.code,
      this.severity,
      `Country of origin "${country}" is not a valid ISO 3166-1 alpha-2 code. Field: country_of_origin.`,
      [{ docType: DocumentType.INVOICE, field: 'country_of_origin', value: country }],
    )
  },
}

/** DECL-003 – Exporter/importer tax identification number must not be blank. */
export const DECL_003: RuleDefinition = {
  code: 'DECL-003',
  name: 'Exporter/importer tax ID must be present',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const declarations = ctx.documents.filter((d) => d.docType === DocumentType.DECLARATION_OUTPUT)
    if (declarations.length === 0) return null

    const missing = declarations.filter(
      (d) =>
        !d.data['importer_tax_id'] ||
        String(d.data['importer_tax_id']).trim() === '',
    )
    if (missing.length === 0) {
      return pass(this.code, this.severity, 'Importer tax ID is present on the declaration.')
    }
    return fail(
      this.code,
      this.severity,
      'Importer/exporter tax identification number is missing on the declaration. Field: importer_tax_id.',
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'importer_tax_id' }],
    )
  },
}

/** DECL-004 – Declaration date must not be in the future. */
export const DECL_004: RuleDefinition = {
  code: 'DECL-004',
  name: 'Declaration date must not be in the future',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const snap = ctx.declarationSnapshot
    if (!snap) return null

    const declarations = ctx.documents.filter((d) => d.docType === DocumentType.DECLARATION_OUTPUT)
    if (declarations.length === 0) return null

    const futureDecls = declarations.filter((d) => {
      const rawDate = d.data['declaration_date']
      if (!rawDate) return false
      const parsed = new Date(String(rawDate))
      return !isNaN(parsed.getTime()) && parsed > new Date()
    })

    if (futureDecls.length === 0) {
      return pass(this.code, this.severity, 'Declaration date is present and not in the future.')
    }
    return fail(
      this.code,
      this.severity,
      'Declaration date is set in the future, which is not allowed. Field: declaration_date.',
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'declaration_date' }],
    )
  },
}

/** DECL-005 – Customs office code must be present on the declaration. */
export const DECL_005: RuleDefinition = {
  code: 'DECL-005',
  name: 'Customs office code must be present',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const declarations = ctx.documents.filter((d) => d.docType === DocumentType.DECLARATION_OUTPUT)
    if (declarations.length === 0) return null

    const missing = declarations.filter(
      (d) =>
        !d.data['customs_office_code'] ||
        String(d.data['customs_office_code']).trim() === '',
    )
    if (missing.length === 0) {
      return pass(this.code, this.severity, 'Customs office code is present.')
    }
    return fail(
      this.code,
      this.severity,
      'Customs office code is missing on the declaration. Field: customs_office_code.',
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'customs_office_code' }],
    )
  },
}
