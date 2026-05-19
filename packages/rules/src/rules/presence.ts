import { DocumentType, RuleSeverity, TradeFlow } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import { failResult, passResult } from '../helpers.js'

export const PRES_001: RuleDefinition = {
  code: 'PRES-001',
  name: 'Tüm gönderiler için fatura zorunludur',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const hasInvoice = ctx.documents.some((d) => d.docType === DocumentType.INVOICE)
    if (hasInvoice) {
      return passResult(this.code, this.severity, 'Fatura bulundu.')
    }
    return failResult(
      this.code,
      this.severity,
      'Gönderide fatura bulunamadı. Tüm ithalat ve ihracat işlemleri için fatura zorunludur.',
      [{ field: 'doc_type', value: DocumentType.INVOICE }],
    )
  },
}

export const PRES_003: RuleDefinition = {
  code: 'PRES-003',
  name: 'İthalatta taşıma belgesi gerekli',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.TRANSPORT_DOC],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== TradeFlow.IMPORT) return null

    const hasTransportDoc = ctx.documents.some(
      (d) =>
        d.docType === DocumentType.TRANSPORT_DOC ||
        d.docType === DocumentType.BILL_OF_LADING ||
        d.docType === DocumentType.AIRWAY_BILL,
    )
    if (hasTransportDoc) {
      return passResult(this.code, this.severity, 'Taşıma belgesi bulundu.')
    }
    return failResult(
      this.code,
      this.severity,
      'Taşıma belgesi (CMR, B/L, AWB vb.) bulunamadı. İthalat işlemlerinde taşıma belgesi genellikle zorunludur.',
      [{ field: 'doc_type', value: DocumentType.TRANSPORT_DOC }],
    )
  },
}

export const PRES_004: RuleDefinition = {
  code: 'PRES-004',
  name: 'Tercihli tarife talebinde menşe belgesi gerekli',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.ORIGIN_DOC],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const snap = ctx.declarationSnapshot
    if (!snap) return null

    const isPreferential =
      snap.regimeCode?.startsWith('4') ||
      ctx.documents.some((d) => d.data['tariff_preference'] === true)

    if (!isPreferential) return null

    const hasCOO = ctx.documents.some(
      (d) =>
        d.docType === DocumentType.ORIGIN_DOC ||
        d.docType === DocumentType.CERTIFICATE_OF_ORIGIN,
    )
    if (hasCOO) {
      return passResult(
        this.code,
        this.severity,
        'Tercihli tarife talebi için menşe belgesi bulundu.',
      )
    }

    return failResult(
      this.code,
      this.severity,
      'Tercihli tarife talebi var ancak menşe belgesi bulunamadı. Lütfen ilgili sertifikayı ekleyin.',
      [{ field: 'doc_type', value: DocumentType.ORIGIN_DOC }],
    )
  },
}

export const PRES_005: RuleDefinition = {
  code: 'PRES-005',
  name: 'Bir gönderide en fazla bir beyanname olmalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const decls = ctx.documents.filter((d) => d.docType === DocumentType.DECLARATION_OUTPUT)
    if (decls.length <= 1) {
      return passResult(this.code, this.severity, 'Tek beyanname belgesi bulundu.')
    }
    return failResult(
      this.code,
      this.severity,
      `${decls.length} adet beyanname belgesi bulundu. Bunun bilinçli olduğunu doğrulayın.`,
    )
  },
}

export const PRES_002: RuleDefinition = {
  code: 'PRES-002',
  name: 'İthalat için çeki listesi gerekli',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== TradeFlow.IMPORT) return null
    const hasPackingList = ctx.documents.some((d) => d.docType === DocumentType.PACKING_LIST)
    if (hasPackingList) {
      return passResult(this.code, this.severity, 'Çeki listesi bulundu.')
    }
    return failResult(
      this.code,
      this.severity,
      'Çeki listesi bulunamadı. İthalat işlemlerinde çeki listesi gereklidir.',
      [{ field: 'doc_type', value: DocumentType.PACKING_LIST }],
    )
  },
}
