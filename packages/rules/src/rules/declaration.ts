import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import {
  failOrReview,
  failResult,
  findDocs,
  hasValue,
  isPlaceholderValue,
  normalizeCountryCode,
  parseFlexibleDate,
  passResult,
} from '../helpers.js'

/** DECL-001 — Rejim kodu 4 haneli sayısal olmalı. */
export const DECL_001: RuleDefinition = {
  code: 'DECL-001',
  name: 'Rejim kodu 4 haneli sayısal olmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const snap = ctx.declarationSnapshot
    if (!snap) return null
    const declarations = findDocs(ctx, DocumentType.DECLARATION_OUTPUT)
    if (!snap.regimeCode) {
      return failOrReview(
        this.code,
        this.severity,
        declarations,
        'Beyannamede rejim kodu (rejim_kodu) eksik. Alan: regime_code.',
        'Beyannameden rejim kodu güvenle okunamadı. Manuel kontrol gerekli.',
        [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'regime_code' }],
      )
    }
    if (/^\d{4}$/.test(snap.regimeCode)) {
      return passResult(
        this.code,
        this.severity,
        `Rejim kodu "${snap.regimeCode}" geçerli 4 haneli kod.`,
      )
    }
    return failResult(
      this.code,
      this.severity,
      `Rejim kodu "${snap.regimeCode}" 4 haneli sayısal kod değil. Alan: regime_code.`,
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'regime_code', value: snap.regimeCode }],
    )
  },
}

/** DECL-002 — Menşe ülke ISO 3166-1 alpha-2 koduna uygun olmalı. */
export const DECL_002: RuleDefinition = {
  code: 'DECL-002',
  name: 'Menşe ülke geçerli olmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT, DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice) return null
    const country = invoice.data['country_of_origin']
    const normalized = normalizeCountryCode(country)
    if (ctx.tradeFlow === 'EXPORT' && !normalized) return null
    if (!hasValue(country) || isPlaceholderValue(country)) {
      return failOrReview(
        this.code,
        this.severity,
        [invoice],
        'Faturada menşe ülke eksik. Alan: country_of_origin.',
        'Faturadan menşe ülke güvenle okunamadı. Manuel kontrol gerekli.',
        [{ docType: DocumentType.INVOICE, field: 'country_of_origin' }],
      )
    }
    if (normalized) {
      return passResult(
        this.code,
        this.severity,
        `Menşe ülke "${country}" geçerli (${normalized}).`,
      )
    }
    return failResult(
      this.code,
      this.severity,
      `Menşe ülke "${country}" ISO 3166-1 alpha-2 koduna normalize edilemedi. Alan: country_of_origin.`,
      [{ docType: DocumentType.INVOICE, field: 'country_of_origin', value: country }],
    )
  },
}

/** DECL-003 — İhracatçı/ithalatçı vergi numarası bulunmalı. */
export const DECL_003: RuleDefinition = {
  code: 'DECL-003',
  name: 'İhracatçı/ithalatçı vergi numarası bulunmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const declarations = findDocs(ctx, DocumentType.DECLARATION_OUTPUT)
    if (declarations.length === 0) return null

    const taxField = ctx.tradeFlow === 'EXPORT' ? 'exporter_tax_id' : 'importer_tax_id'
    const missing = declarations.filter((d) => !hasValue(d.data[taxField]))
    if (missing.length === 0) {
      return passResult(this.code, this.severity, `${taxField} beyannamede mevcut.`)
    }
    return failOrReview(
      this.code,
      this.severity,
      missing,
      `Beyannamede ihracatçı/ithalatçı vergi numarası eksik. Alan: ${taxField}.`,
      'Vergi numarası beyannameden güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: taxField }],
    )
  },
}

/** DECL-004 — Beyanname tarihi gelecekte olamaz. */
export const DECL_004: RuleDefinition = {
  code: 'DECL-004',
  name: 'Beyanname tarihi gelecekte olamaz',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const snap = ctx.declarationSnapshot
    if (!snap) return null

    const declarations = findDocs(ctx, DocumentType.DECLARATION_OUTPUT)
    if (declarations.length === 0) return null

    const today = new Date()
    const future = declarations.filter((d) => {
      const parsed = parseFlexibleDate(d.data['declaration_date'])
      return parsed ? parsed > today : false
    })

    if (future.length === 0) {
      return passResult(this.code, this.severity, 'Beyanname tarihi mevcut ve gelecekte değil.')
    }
    return failResult(
      this.code,
      this.severity,
      'Beyanname tarihi gelecekte olarak işaretlenmiş. Alan: declaration_date.',
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'declaration_date' }],
    )
  },
}

/** DECL-005 — Gümrük idaresi kodu bulunmalı. */
export const DECL_005: RuleDefinition = {
  code: 'DECL-005',
  name: 'Gümrük idaresi kodu bulunmalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const declarations = findDocs(ctx, DocumentType.DECLARATION_OUTPUT)
    if (declarations.length === 0) return null

    const missing = declarations.filter((d) => !hasValue(d.data['customs_office_code']))
    if (missing.length === 0) {
      return passResult(this.code, this.severity, 'Gümrük idaresi kodu mevcut.')
    }
    return failOrReview(
      this.code,
      this.severity,
      missing,
      'Beyannamede gümrük idaresi kodu eksik. Alan: customs_office_code.',
      'Gümrük idaresi kodu beyannameden güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'customs_office_code' }],
    )
  },
}
