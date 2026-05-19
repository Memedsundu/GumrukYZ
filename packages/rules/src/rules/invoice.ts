import { DocumentType, RuleSeverity, isValidCurrency, isValidIncoterm } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import {
  failOrReview,
  failResult,
  findDocs,
  hasValue,
  parseFlexibleDate,
  passResult,
  toFiniteNumber,
} from '../helpers.js'

function getInvoices(ctx: SubmissionContext) {
  return findDocs(ctx, DocumentType.INVOICE)
}

export const INV_001: RuleDefinition = {
  code: 'INV-001',
  name: 'Fatura numarası bulunmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null
    const missing = invoices.filter((inv) => !hasValue(inv.data['invoice_number']))
    if (missing.length === 0) {
      return passResult(this.code, this.severity, 'Fatura numarası mevcut.')
    }
    return failOrReview(
      this.code,
      this.severity,
      missing,
      'Faturada fatura numarası eksik. Alan: invoice_number.',
      'Faturada fatura numarası okunamadı. Çıkarma güveni düşük — belgeyi gözden geçirin.',
      [{ docType: DocumentType.INVOICE, field: 'invoice_number' }],
    )
  },
}

export const INV_002: RuleDefinition = {
  code: 'INV-002',
  name: 'Fatura tarihi geçerli olmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const today = new Date()
    const offenders = invoices.filter((inv) => {
      const parsed = parseFlexibleDate(inv.data['invoice_date'])
      return !parsed || parsed > today
    })

    if (offenders.length === 0) {
      return passResult(this.code, this.severity, 'Fatura tarihi geçerli.')
    }

    return failOrReview(
      this.code,
      this.severity,
      offenders,
      'Fatura tarihi eksik, ayrıştırılamadı veya gelecekte. Alan: invoice_date.',
      'Fatura tarihi okunamadı veya beklenmedik biçimde. Manuel kontrol gerekli.',
      [{ docType: DocumentType.INVOICE, field: 'invoice_date' }],
    )
  },
}

export const INV_003: RuleDefinition = {
  code: 'INV-003',
  name: 'Satıcı ve alıcı tanımlanmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const offenders = invoices.filter(
      (inv) => !hasValue(inv.data['seller_name']) || !hasValue(inv.data['buyer_name']),
    )

    if (offenders.length === 0) {
      return passResult(this.code, this.severity, 'Satıcı ve alıcı tanımlı.')
    }

    return failOrReview(
      this.code,
      this.severity,
      offenders,
      'Faturada satıcı (seller_name) veya alıcı (buyer_name) eksik.',
      'Satıcı/alıcı bilgileri faturadan güvenle okunamadı. Manuel kontrol gerekli.',
      [
        { docType: DocumentType.INVOICE, field: 'seller_name' },
        { docType: DocumentType.INVOICE, field: 'buyer_name' },
      ],
    )
  },
}

export const INV_004: RuleDefinition = {
  code: 'INV-004',
  name: 'Para birimi geçerli ISO 4217 olmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const invalid = invoices.filter(
      (inv) => hasValue(inv.data['currency']) && !isValidCurrency(String(inv.data['currency'])),
    )

    if (invalid.length === 0) {
      return passResult(this.code, this.severity, 'Para birimi geçerli.')
    }

    const badValues = invalid.map((inv) => inv.data['currency']).join(', ')
    return failResult(
      this.code,
      this.severity,
      `Para birimi kodu "${badValues}" geçerli bir ISO 4217 kodu değil. Alan: currency.`,
      [{ docType: DocumentType.INVOICE, field: 'currency', value: badValues }],
    )
  },
}

export const INV_005: RuleDefinition = {
  code: 'INV-005',
  name: 'Toplam tutar pozitif olmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const offenders = invoices.filter((inv) => {
      const amount = toFiniteNumber(inv.data['total_amount'])
      return amount == null || amount <= 0
    })

    if (offenders.length === 0) {
      return passResult(this.code, this.severity, 'Toplam tutar pozitif.')
    }

    return failOrReview(
      this.code,
      this.severity,
      offenders,
      'Fatura toplam tutarı eksik veya pozitif değil. Alan: total_amount.',
      'Fatura toplam tutarı güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: DocumentType.INVOICE, field: 'total_amount' }],
    )
  },
}

export const INV_006: RuleDefinition = {
  code: 'INV-006',
  name: 'Incoterm Incoterms 2020 değerlerinden olmalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = getInvoices(ctx)
    if (invoices.length === 0) return null

    const invalid = invoices.filter(
      (inv) => hasValue(inv.data['incoterm']) && !isValidIncoterm(String(inv.data['incoterm'])),
    )

    if (invalid.length === 0) {
      return passResult(this.code, this.severity, 'Incoterm geçerli veya belirtilmemiş.')
    }

    const badValues = invalid.map((inv) => inv.data['incoterm']).join(', ')
    return failResult(
      this.code,
      this.severity,
      `Incoterm "${badValues}" Incoterms 2020 listesinde değil. Alan: incoterm.`,
      [{ docType: DocumentType.INVOICE, field: 'incoterm', value: badValues }],
    )
  },
}
