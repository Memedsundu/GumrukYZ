/**
 * İhracat odaklı kurallar — tradeFlow === 'EXPORT' iken çalışır.
 * Türkiye mevzuatına uyumlu:
 * - 4458 Sayılı Gümrük Kanunu (Madde 161–194 ihracat hükümleri)
 * - Gümrük Yönetmeliği ihracat rejimleri
 * - Dış Ticaret Mevzuatı (İhracat Yönetmeliği)
 */
import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import { failOrReview, failResult, hasValue, passResult } from '../helpers.js'

/** EXP-001 — İhracat faturasında fatura numarası bulunmalı. */
export const EXP_001: RuleDefinition = {
  code: 'EXP-001',
  name: 'İhracat faturasında fatura numarası bulunmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice) return null

    if (hasValue(invoice.data['invoice_number'])) {
      return passResult(
        this.code,
        this.severity,
        `İhracat fatura numarası mevcut: ${invoice.data['invoice_number']}.`,
      )
    }
    return failOrReview(
      this.code,
      this.severity,
      [invoice],
      'İhracat faturasında fatura numarası bulunmalı (Gümrük Yönetmeliği Madde 168).',
      'İhracat fatura numarası güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: DocumentType.INVOICE, field: 'invoice_number', value: null }],
    )
  },
}

/** EXP-002 — İhracat faturası satıcı/ihracatçıyı tanımlamalı. */
export const EXP_002: RuleDefinition = {
  code: 'EXP-002',
  name: 'İhracat faturasında satıcı/ihracatçı tanımlanmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice) return null

    const seller = invoice.data['seller_name']
    if (hasValue(seller) && String(seller).trim().length > 2) {
      return passResult(this.code, this.severity, `İhracatçı/satıcı belirtilmiş: ${seller}.`)
    }
    return failOrReview(
      this.code,
      this.severity,
      [invoice],
      'İhracat faturası satıcı/ihracatçıyı tanımlamalı (4458 Sayılı Gümrük Kanunu Madde 168).',
      'Satıcı/ihracatçı bilgisi güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: DocumentType.INVOICE, field: 'seller_name', value: null }],
    )
  },
}

/** EXP-003 — İhracat beyannamesinde geçerli ihracat rejim kodu olmalı. */
export const EXP_003: RuleDefinition = {
  code: 'EXP-003',
  name: 'İhracat beyannamesinde geçerli ihracat rejim kodu olmalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const snap = ctx.declarationSnapshot
    if (!snap?.regimeCode) return null

    const regime = String(snap.regimeCode).trim()
    const validExportPrefixes = ['10', '11', '21', '22', '23', '31']
    const pass = validExportPrefixes.some((prefix) => regime.startsWith(prefix))

    if (pass) {
      return passResult(
        this.code,
        this.severity,
        `İhracat rejim kodu "${regime}" geçerli.`,
      )
    }
    return failResult(
      this.code,
      this.severity,
      `Rejim kodu "${regime}" bir ihracat rejimi gibi görünmüyor. Beklenen ön ekler: ${validExportPrefixes.join(', ')} (Gümrük Yönetmeliği ihracat rejimleri).`,
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'regime_code', value: regime }],
    )
  },
}

/** EXP-004 — İhracat faturasında menşe ülke belirtilmeli (tercihli menşe için). */
export const EXP_004: RuleDefinition = {
  code: 'EXP-004',
  name: 'İhracat faturasında menşe ülke belirtilmeli',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice) return null

    const coo = invoice.data['country_of_origin']
    if (hasValue(coo) && String(coo).trim().length >= 2) {
      return passResult(this.code, this.severity, `Faturada menşe ülke belirtilmiş: ${coo}.`)
    }
    return failOrReview(
      this.code,
      this.severity,
      [invoice],
      'İhracat faturasında menşe ülke eksik. Tercihli tarife ve A.TR/EUR.1 menşe beyanları için gereklidir.',
      'Menşe ülke faturadan güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: DocumentType.INVOICE, field: 'country_of_origin', value: null }],
    )
  },
}

/** EXP-005 — Geçici ihracat (21/22) için yükleme talimatı olmalı. */
export const EXP_005: RuleDefinition = {
  code: 'EXP-005',
  name: 'Geçici ihracatta yükleme talimatı bulunmalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT, DocumentType.LOADING_INSTRUCTION],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const snap = ctx.declarationSnapshot
    if (!snap?.regimeCode) return null

    const regime = String(snap.regimeCode).trim()
    const isTemporaryExport = regime.startsWith('21') || regime.startsWith('22')
    if (!isTemporaryExport) return null

    const hasLoadingInstruction = ctx.documents.some(
      (d) => d.docType === DocumentType.LOADING_INSTRUCTION,
    )

    if (hasLoadingInstruction) {
      return passResult(this.code, this.severity, 'Geçici ihracat için yükleme talimatı mevcut.')
    }
    return failResult(
      this.code,
      this.severity,
      `Geçici ihracat (rejim ${regime}) için yükleme talimatı eklenmeli. İzlenebilirlik ve geri-ithalat uyumu için gereklidir.`,
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'regime_code', value: regime }],
    )
  },
}
