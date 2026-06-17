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

type FreeOfChargeEvidence = {
  docType: string
  field: string
  value: unknown
}

type InvoiceRef = {
  number: string
  freeOfCharge: boolean
  commercialInvoice: boolean
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

/** EXP-006 — Bedelsiz/F.O.C ihracat sinyali destek faturasıyla açıklanmalı. */
export const EXP_006: RuleDefinition = {
  code: 'EXP-006',
  name: 'Bedelsiz/F.O.C ihracat desteği kontrol edilmeli',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'EXPORT') return null

    const evidence = collectFreeOfChargeEvidence(ctx)
    if (evidence.length === 0) return null

    const invoiceNumbers = new Set(
      ctx.documents
        .filter((doc) => doc.docType === DocumentType.INVOICE)
        .map((doc) => normalizeInvoiceNumber(doc.data['invoice_number']))
        .filter((number) => looksLikeCommercialInvoiceNumber(number)),
    )
    const invoiceRefs = collectInvoiceRefs(ctx)
    const focRefs = invoiceRefs.filter((ref) => ref.freeOfCharge && ref.commercialInvoice)
    const missingFocRefs = focRefs.filter((ref) => !invoiceNumbers.has(ref.number))
    const lineValues = collectFreeOfChargeLineValues(ctx)

    if (ctx.documents.every((doc) => doc.docType !== DocumentType.INVOICE) || missingFocRefs.length > 0 || lineValues.length > 0) {
      const details = [
        missingFocRefs.length > 0
          ? `eksik F.O.C fatura referansı: ${missingFocRefs.map((ref) => ref.number).join(', ')}`
          : null,
        lineValues.length > 0
          ? `bedelsiz notu bulunan kalemde görünen değer(ler): ${lineValues.map(formatNumber).join(', ')}`
          : null,
        ctx.documents.every((doc) => doc.docType !== DocumentType.INVOICE)
          ? 'fatura belgesi dosyada yok'
          : null,
      ].filter(Boolean).join('; ')

      return reviewResult(
        this.code,
        this.severity,
        `Bedelsiz/F.O.C ihracat sinyali için destek belge ve değer açıklaması manuel doğrulanmalı${details ? ` (${details})` : ''}.`,
        [
          ...evidence.map((entry) => ({
            docType: entry.docType,
            field: entry.field,
            value: entry.value,
          })),
          ...missingFocRefs.map((ref) => ({
            field: 'invoice_refs',
            value: `${ref.number} (F.O.C)`,
          })),
        ],
      )
    }

    return passResult(
      this.code,
      this.severity,
      'Bedelsiz/F.O.C sinyali destekleyici fatura bilgileriyle birlikte görünüyor.',
    )
  },
}

function collectFreeOfChargeEvidence(ctx: SubmissionContext): FreeOfChargeEvidence[] {
  const evidence: FreeOfChargeEvidence[] = []
  for (const doc of ctx.documents) {
    if (doc.data['free_of_charge'] === true) {
      evidence.push({ docType: doc.docType, field: 'free_of_charge', value: true })
    }

    const invoiceRefs = parseInvoiceRefs(doc.data['invoice_refs'])
    for (const ref of invoiceRefs) {
      if (!ref.freeOfCharge) continue
      evidence.push({
        docType: doc.docType,
        field: 'invoice_refs',
        value: `${ref.number} (F.O.C)`,
      })
    }

    const text = JSON.stringify(doc.data)
    if (/F\.?\s*O\.?\s*C\.?|Bedelsiz|FREE OF CHARGE/i.test(text)) {
      evidence.push({ docType: doc.docType, field: 'structured_json', value: 'Bedelsiz/F.O.C' })
    }
  }

  return evidence
}

function collectInvoiceRefs(ctx: SubmissionContext): InvoiceRef[] {
  const refs = new Map<string, InvoiceRef>()
  for (const doc of ctx.documents) {
    for (const ref of parseInvoiceRefs(doc.data['invoice_refs'])) {
      refs.set(ref.number, ref)
    }
  }
  return Array.from(refs.values())
}

function parseInvoiceRefs(rawRefs: unknown): InvoiceRef[] {
  if (!Array.isArray(rawRefs)) return []
  const refs: InvoiceRef[] = []
  for (const rawRef of rawRefs) {
    if (!rawRef || typeof rawRef !== 'object' || Array.isArray(rawRef)) continue
    const ref = rawRef as Record<string, unknown>
    const number = normalizeInvoiceNumber(ref['number'])
    if (!number) continue
    refs.push({
      number,
      freeOfCharge: ref['free_of_charge'] === true || /F\.?\s*O\.?\s*C\.?|Bedelsiz/i.test(number),
      commercialInvoice: looksLikeCommercialInvoiceNumber(number),
    })
  }
  return refs
}

function normalizeInvoiceNumber(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function looksLikeCommercialInvoiceNumber(value: unknown): boolean {
  return /^FI[A-Z0-9-]{6,}$/.test(normalizeInvoiceNumber(value))
}

function collectFreeOfChargeLineValues(ctx: SubmissionContext): number[] {
  const values: number[] = []
  for (const doc of ctx.documents) {
    const rawValues = doc.data['free_of_charge_line_values']
    if (!Array.isArray(rawValues)) continue
    for (const value of rawValues) {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > 0) values.push(numeric)
    }
  }
  return values
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}
