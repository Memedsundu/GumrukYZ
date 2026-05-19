import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import {
  failOrReview,
  failResult,
  hasValue,
  passResult,
} from '../helpers.js'

function getBLs(ctx: SubmissionContext) {
  return ctx.documents.filter((d) => {
    if (d.docType === DocumentType.BILL_OF_LADING) return true
    if (d.docType !== DocumentType.TRANSPORT_DOC) return false
    const documentType = String(d.data['document_type'] ?? '').toUpperCase()
    return (
      documentType.includes('B/L') ||
      documentType.includes('BILL OF LADING') ||
      documentType.includes('KONŞIMENTO') ||
      documentType.includes('KONSIMENTO')
    )
  })
}

function refDocType(docType: DocumentType): DocumentType {
  return docType
}

function textField(
  data: Record<string, unknown>,
  fields: string[],
): { field: string; value: string | null } {
  for (const field of fields) {
    const value = data[field]
    if (hasValue(value)) return { field, value: String(value).trim() }
  }
  return { field: fields[0]!, value: null }
}

/** BL-001 — Konşimento numarası bulunmalı. */
export const BL_001: RuleDefinition = {
  code: 'BL-001',
  name: 'Konşimento numarası bulunmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.TRANSPORT_DOC],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const bls = getBLs(ctx)
    if (bls.length === 0) return null

    const missing = bls.filter((bl) => !textField(bl.data, ['bl_number', 'document_number']).value)
    if (missing.length === 0) {
      return passResult(this.code, this.severity, 'Konşimento numarası mevcut.')
    }
    return failOrReview(
      this.code,
      this.severity,
      missing,
      'Konşimentoda belge numarası eksik. Alan: document_number.',
      'Konşimento belge numarası güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: refDocType(bls[0]!.docType), field: 'document_number' }],
    )
  },
}

/** BL-002 — Yükleme ve boşaltma limanları bulunmalı. */
export const BL_002: RuleDefinition = {
  code: 'BL-002',
  name: 'Yükleme ve boşaltma limanları bulunmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.TRANSPORT_DOC],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const bls = getBLs(ctx)
    if (bls.length === 0) return null

    const missingPOL = bls.filter(
      (bl) => !textField(bl.data, ['port_of_loading', 'loading_port', 'departure']).value,
    )
    const missingPOD = bls.filter(
      (bl) => !textField(bl.data, ['port_of_discharge', 'discharge_port', 'destination']).value,
    )

    if (missingPOL.length === 0 && missingPOD.length === 0) {
      return passResult(
        this.code,
        this.severity,
        'Yükleme ve boşaltma limanlarının her ikisi de mevcut.',
      )
    }

    const missing: string[] = []
    if (missingPOL.length > 0) missing.push('departure/loading_port')
    if (missingPOD.length > 0) missing.push('destination/discharge_port')

    return failOrReview(
      this.code,
      this.severity,
      [...missingPOL, ...missingPOD],
      `Konşimentoda eksik liman alanı: ${missing.join(', ')}.`,
      'Liman bilgileri konşimentodan güvenle okunamadı. Manuel kontrol gerekli.',
      missing.map((f) => ({ docType: refDocType(bls[0]!.docType), field: f })),
    )
  },
}

/** BL-003 — Konşimento alıcısı fatura alıcısıyla uyumlu olmalı. */
export const BL_003: RuleDefinition = {
  code: 'BL-003',
  name: 'Konşimento alıcısı fatura alıcısıyla uyumlu olmalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.TRANSPORT_DOC, DocumentType.INVOICE],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const bls = getBLs(ctx)
    if (bls.length === 0) return null

    const bl = bls[0]!
    const consignee = bl.data['consignee']
    if (!hasValue(consignee)) {
      return failOrReview(
        this.code,
        this.severity,
        [bl],
        'Konşimentoda alıcı (consignee) alanı boş. Alan: consignee.',
        'Konşimento alıcısı güvenle okunamadı. Manuel kontrol gerekli.',
        [{ docType: refDocType(bl.docType), field: 'consignee' }],
      )
    }

    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice || !hasValue(invoice.data['buyer_name'])) {
      return passResult(
        this.code,
        this.severity,
        'Konşimento alıcısı mevcut (fatura alıcısı ile karşılaştırma yapılamadı).',
      )
    }

    const consigneeLower = String(consignee).toLowerCase()
    const buyerLower = String(invoice.data['buyer_name']).toLowerCase()
    const match = consigneeLower.includes(buyerLower) || buyerLower.includes(consigneeLower)
    if (match) {
      return passResult(this.code, this.severity, 'Konşimento alıcısı fatura alıcısıyla uyumlu.')
    }

    return failResult(
      this.code,
      this.severity,
      `Konşimento alıcısı "${consignee}" fatura alıcısı "${invoice.data['buyer_name']}" ile uyuşmuyor. Lütfen doğrulayın.`,
      [
        { docType: refDocType(bl.docType), field: 'consignee', value: consignee },
        { docType: DocumentType.INVOICE, field: 'buyer_name', value: invoice.data['buyer_name'] },
      ],
    )
  },
}
