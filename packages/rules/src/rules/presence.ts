import { DocumentType, RuleSeverity, TradeFlow } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import { passResult, reviewResult } from '../helpers.js'

export const PRES_001: RuleDefinition = {
  code: 'PRES-001',
  name: 'Tüm gönderiler için fatura beklenir',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const hasInvoice = ctx.documents.some((d) => d.docType === DocumentType.INVOICE)
    if (hasInvoice) {
      return passResult(this.code, this.severity, 'Beklenen fatura belgesi mevcut.')
    }
    return reviewResult(
      this.code,
      this.severity,
      'Beklenen fatura belgesi dosyada yok. Analiz mevcut belgelerle sınırlıdır; fatura eklenmeden beyanname tutarlılığı tam doğrulanamaz.',
      [{ field: 'doc_type', value: DocumentType.INVOICE }],
    )
  },
}

export const PRES_003: RuleDefinition = {
  code: 'PRES-003',
  name: 'İthalatta taşıma belgesi beklenir',
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
      return passResult(this.code, this.severity, 'Beklenen taşıma belgesi mevcut.')
    }
    return reviewResult(
      this.code,
      this.severity,
      'Beklenen taşıma belgesi (CMR, konşimento, AWB vb.) dosyada yok. Analiz mevcut belgelerle sınırlıdır.',
      [{ field: 'doc_type', value: DocumentType.TRANSPORT_DOC }],
    )
  },
}

export const PRES_004: RuleDefinition = {
  code: 'PRES-004',
  name: 'Tercihli tarife talebinde menşe belgesi beklenir',
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
        'Tercihli tarife sinyali için beklenen menşe belgesi mevcut.',
      )
    }

    return reviewResult(
      this.code,
      this.severity,
      'Tercihli tarife sinyali var ancak beklenen menşe belgesi dosyada yok. Analiz mevcut belgelerle sınırlıdır.',
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
      return passResult(this.code, this.severity, 'Beklenen tek beyanname çıktısı mevcut.')
    }
    return reviewResult(
      this.code,
      this.severity,
      `${decls.length} adet beyanname çıktısı var. Bunun bilinçli olup olmadığını doğrulayın.`,
    )
  },
}

export const PRES_002: RuleDefinition = {
  code: 'PRES-002',
  name: 'Çeki listesi beklenir',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== TradeFlow.IMPORT && ctx.tradeFlow !== TradeFlow.EXPORT) return null
    const hasPackingList = ctx.documents.some((d) => d.docType === DocumentType.PACKING_LIST)
    if (hasPackingList) {
      return passResult(this.code, this.severity, 'Beklenen çeki listesi mevcut.')
    }
    return reviewResult(
      this.code,
      this.severity,
      ctx.tradeFlow === TradeFlow.IMPORT
        ? 'Beklenen çeki listesi dosyada yok. Analiz mevcut belgelerle sınırlıdır.'
        : 'Beklenen çeki listesi dosyada yok. Analiz mevcut belgelerle sınırlıdır.',
      [{ field: 'doc_type', value: DocumentType.PACKING_LIST }],
    )
  },
}

export const PRES_006: RuleDefinition = {
  code: 'PRES-006',
  name: 'İhracatta yükleme talimatı beklenir',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.LOADING_INSTRUCTION],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== TradeFlow.EXPORT) return null
    const hasLoadingInstruction = ctx.documents.some(
      (d) => d.docType === DocumentType.LOADING_INSTRUCTION,
    )
    if (hasLoadingInstruction) {
      return passResult(this.code, this.severity, 'Beklenen yükleme talimatı mevcut.')
    }
    return reviewResult(
      this.code,
      this.severity,
      'Beklenen yükleme talimatı dosyada yok. Analiz mevcut belgelerle sınırlıdır.',
      [{ field: 'doc_type', value: DocumentType.LOADING_INSTRUCTION }],
    )
  },
}
