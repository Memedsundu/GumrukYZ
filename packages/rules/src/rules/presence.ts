import { DocumentType, RuleSeverity, TradeFlow } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import { passResult, reviewResult } from '../helpers.js'

type InvoiceReferenceEvidence = {
  docType: string
  number: string
  freeOfCharge: boolean
}

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
    const invoiceRefs = collectInvoiceReferences(ctx)
    if (invoiceRefs.length > 0) {
      return reviewResult(
        this.code,
        this.severity,
        `Referans verilen fatura(lar) dosyada yok: ${formatInvoiceReferences(invoiceRefs)}. Analiz mevcut belgelerle sınırlıdır; bu faturalar eklenmeden kıymet, bedelsiz ve taraf tutarlılığı tam doğrulanamaz.`,
        invoiceRefs.map((ref) => ({
          docType: ref.docType,
          field: 'invoice_refs',
          value: ref.freeOfCharge ? `${ref.number} (F.O.C)` : ref.number,
        })),
      )
    }
    return reviewResult(
      this.code,
      this.severity,
      'Beklenen fatura belgesi dosyada yok. Analiz mevcut belgelerle sınırlıdır; fatura eklenmeden beyanname tutarlılığı tam doğrulanamaz.',
      [{ field: 'doc_type', value: DocumentType.INVOICE }],
    )
  },
}

function collectInvoiceReferences(ctx: SubmissionContext): InvoiceReferenceEvidence[] {
  const refs = new Map<string, InvoiceReferenceEvidence>()
  for (const doc of ctx.documents) {
    const rawRefs = doc.data['invoice_refs']
    if (Array.isArray(rawRefs)) {
      for (const rawRef of rawRefs) {
        if (!rawRef || typeof rawRef !== 'object' || Array.isArray(rawRef)) continue
        const ref = rawRef as Record<string, unknown>
        const number = String(ref['number'] ?? '').trim()
        if (!number) continue
        refs.set(number, {
          docType: doc.docType,
          number,
          freeOfCharge: ref['free_of_charge'] === true,
        })
      }
    }

    for (const field of ['related_invoice', 'invoice_number', 'invoice_no']) {
      const number = String(doc.data[field] ?? '').trim()
      if (!number || doc.docType === DocumentType.INVOICE) continue
      refs.set(number, {
        docType: doc.docType,
        number,
        freeOfCharge: /F\.?\s*O\.?\s*C\.?|BEDELS[İI]Z/i.test(number),
      })
    }
  }
  return Array.from(refs.values())
}

function formatInvoiceReferences(refs: InvoiceReferenceEvidence[]): string {
  return refs
    .map((ref) => ref.freeOfCharge ? `${ref.number} (F.O.C)` : ref.number)
    .join(', ')
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
    if (decls.length === 0) return null
    if (decls.length === 1) {
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
    return null
  },
}
