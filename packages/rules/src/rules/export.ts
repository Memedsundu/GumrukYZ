/**
 * İhracat odaklı kurallar — tradeFlow === 'EXPORT' iken çalışır.
 * Türkiye mevzuatına uyumlu:
 * - 4458 Sayılı Gümrük Kanunu (Madde 161–194 ihracat hükümleri)
 * - Gümrük Yönetmeliği ihracat rejimleri
 * - Dış Ticaret Mevzuatı (İhracat Yönetmeliği)
 */
import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { ExtractionData, RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import {
  failOrReview,
  failResult,
  hasValue,
  isPlaceholderValue,
  normalizeCountryCode,
  passResult,
  reviewResult,
} from '../helpers.js'

type OriginEvidence = {
  doc: ExtractionData
  field: string
  value: unknown
  normalized: string | null
}

const EXPORT_ORIGIN_DOC_TYPES = new Set<string>([
  DocumentType.INVOICE,
  DocumentType.PACKING_LIST,
  DocumentType.DECLARATION_OUTPUT,
  DocumentType.ORIGIN_DOC,
])

const ORIGIN_FIELDS = [
  'country_of_origin',
  'origin_country',
  'goods_origin',
  'origin',
  'mense_ulke',
  'menşe_ülke',
]

function collectExportOriginEvidence(ctx: SubmissionContext): OriginEvidence[] {
  const evidence: OriginEvidence[] = []

  for (const doc of ctx.documents) {
    if (!EXPORT_ORIGIN_DOC_TYPES.has(doc.docType)) continue

    const topLevel = collectTopLevelOriginEvidence(doc)
    evidence.push(...topLevel)
    evidence.push(...collectItemOriginEvidence(doc))

    if (
      topLevel.length === 0 &&
      (
        doc.docType === DocumentType.INVOICE ||
        doc.docType === DocumentType.PACKING_LIST ||
        doc.docType === DocumentType.DECLARATION_OUTPUT
      )
    ) {
      evidence.push({
        doc,
        field: 'country_of_origin',
        value: null,
        normalized: null,
      })
    }
  }

  return evidence
}

function collectTopLevelOriginEvidence(doc: ExtractionData): OriginEvidence[] {
  const evidence: OriginEvidence[] = []
  for (const field of ORIGIN_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(doc.data, field)) continue
    const value = doc.data[field]
    evidence.push({
      doc,
      field,
      value,
      normalized: normalizeCountryCode(value),
    })
  }
  return evidence
}

function collectItemOriginEvidence(doc: ExtractionData): OriginEvidence[] {
  const items = doc.data['items']
  if (!Array.isArray(items)) return []

  const evidence: OriginEvidence[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const data = item as Record<string, unknown>
    for (const field of ORIGIN_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(data, field)) continue
      const value = data[field]
      evidence.push({
        doc,
        field: `items[].${field}`,
        value,
        normalized: normalizeCountryCode(value),
      })
    }
  }
  return evidence
}

function sourceRefsFromOriginEvidence(evidence: OriginEvidence[]) {
  return evidence.map((entry) => ({
    docType: entry.doc.docType,
    field: entry.field,
    value: entry.value,
  }))
}

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

/** EXP-004 — İhracat dosyasında menşe ülke belirtilmeli. */
export const EXP_004: RuleDefinition = {
  code: 'EXP-004',
  name: 'İhracat dosyasında menşe ülke belirtilmeli',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    if (!invoice) return null

    const evidence = collectExportOriginEvidence(ctx)
    const meaningfulEvidence = evidence.filter(
      (entry) => hasValue(entry.value) && !isPlaceholderValue(entry.value),
    )
    const validEvidence = meaningfulEvidence.filter((entry) => entry.normalized)
    const validCodes = new Set(validEvidence.map((entry) => entry.normalized))

    if (validCodes.size === 1) {
      const sample = validEvidence[0]
      return passResult(
        this.code,
        this.severity,
        `İhracat dosyasında menşe ülke belirtilmiş: ${sample?.value} (${sample?.normalized}).`,
      )
    }

    if (validCodes.size > 1) {
      return reviewResult(
        this.code,
        this.severity,
        'İhracat dosyasındaki menşe ülke bilgileri farklı ülkelere işaret ediyor; fatura, çeki listesi ve beyanname özetindeki menşe alanları manuel doğrulanmalı.',
        sourceRefsFromOriginEvidence(meaningfulEvidence),
      )
    }

    if (meaningfulEvidence.length > 0) {
      return reviewResult(
        this.code,
        this.severity,
        'İhracat dosyasındaki menşe ülke bilgisi standart ülke adı veya ISO ülke koduna normalize edilemedi. Menşe kanıtı ya da düzeltilmiş belge istenmeli.',
        sourceRefsFromOriginEvidence(meaningfulEvidence),
      )
    }

    return reviewResult(
      this.code,
      this.severity,
      'İhracat dosyasında menşe ülke bilgisi bulunamadı veya ":" gibi yer tutucu değerlerle boş bırakıldı. Menşe kanıtı ya da düzeltilmiş belge istenmeli.',
      sourceRefsFromOriginEvidence(evidence),
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
