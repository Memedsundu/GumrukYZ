import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import {
  failOrReview,
  findDocs,
  hasValue,
  passResult,
  reviewResult,
  toFiniteNumber,
} from '../helpers.js'

const TOLERANCE = 0.01

function getPackingLists(ctx: SubmissionContext) {
  return findDocs(ctx, DocumentType.PACKING_LIST)
}

function withinTolerance(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true
  const base = Math.max(Math.abs(a), Math.abs(b))
  return Math.abs(a - b) / base <= TOLERANCE
}

function getItems(data: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(data['items'])) return []
  return data['items'].filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  )
}

function sumItemField(data: Record<string, unknown>, field: string): number | null {
  const values = getItems(data)
    .map((item) => toFiniteNumber(item[field]))
    .filter((value): value is number => value != null && value > 0)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0)
}

export const PL_001: RuleDefinition = {
  code: 'PL-001',
  name: 'Koli/paket sayısı pozitif tam sayı olmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const pls = getPackingLists(ctx)
    if (pls.length === 0) return null

    const offenders = pls.filter((pl) => {
      const count = toFiniteNumber(pl.data['package_count'])
      return count == null || !Number.isInteger(count) || count <= 0
    })

    if (offenders.length > 0) {
      return failOrReview(
        this.code,
        this.severity,
        offenders,
        'Çeki listesinde paket sayısı eksik veya pozitif tam sayı değil. Alan: package_count.',
        'Çeki listesinden paket sayısı güvenle okunamadı. Manuel kontrol gerekli.',
        [{ docType: DocumentType.PACKING_LIST, field: 'package_count' }],
      )
    }

    const internalMismatches = pls
      .map((pl) => {
        const total = toFiniteNumber(pl.data['package_count'])
        const rowTotal = sumItemField(pl.data, 'package_count')
        if (total == null || rowTotal == null || total === rowTotal) return null
        return { total, rowTotal }
      })
      .filter((mismatch): mismatch is { total: number; rowTotal: number } => mismatch != null)

    if (internalMismatches.length > 0) {
      const detail = internalMismatches
        .map((m) => `satır kap toplamı ${m.rowTotal}, toplam kap sayısı ${m.total}`)
        .join('; ')

      return reviewResult(
        this.code,
        RuleSeverity.WARNING,
        `Çeki listesinde kap toplamları satırlarla uyuşmuyor: ${detail}. Ambalaj satırları ve toplam alanı manuel kontrol edilmeli.`,
        [
          { docType: DocumentType.PACKING_LIST, field: 'package_count' },
          { docType: DocumentType.PACKING_LIST, field: 'items[].package_count' },
        ],
      )
    }

    return passResult(this.code, this.severity, 'Paket sayısı geçerli.')
  },
}

export const PL_002: RuleDefinition = {
  code: 'PL-002',
  name: 'Brüt ağırlık bulunmalı ve satır toplamlarıyla uyumlu olmalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const pls = getPackingLists(ctx)
    if (pls.length === 0) return null

    const offenders = pls.filter((pl) => {
      const weight = toFiniteNumber(pl.data['gross_weight'])
      return weight == null || weight <= 0 || !hasValue(pl.data['gross_weight'])
    })

    if (offenders.length > 0) {
      return failOrReview(
        this.code,
        this.severity,
        offenders,
        'Çeki listesinde brüt ağırlık eksik veya pozitif değil. Alan: gross_weight.',
        'Çeki listesinden brüt ağırlık güvenle okunamadı. Manuel kontrol gerekli.',
        [{ docType: DocumentType.PACKING_LIST, field: 'gross_weight' }],
      )
    }

    const internalMismatches = pls.flatMap((pl) => {
      const mismatches: Array<{ label: string; total: number; rowTotal: number; field: string }> = []
      const gross = toFiniteNumber(pl.data['gross_weight'])
      const grossRows = sumItemField(pl.data, 'gross_weight')
      if (gross != null && grossRows != null && !withinTolerance(gross, grossRows)) {
        mismatches.push({
          label: 'brüt ağırlık',
          total: gross,
          rowTotal: grossRows,
          field: 'gross_weight',
        })
      }

      const net = toFiniteNumber(pl.data['net_weight'])
      const netRows = sumItemField(pl.data, 'net_weight')
      if (net != null && netRows != null && !withinTolerance(net, netRows)) {
        mismatches.push({
          label: 'net ağırlık',
          total: net,
          rowTotal: netRows,
          field: 'net_weight',
        })
      }
      return mismatches
    })

    if (internalMismatches.length > 0) {
      const detail = internalMismatches
        .map((m) => `${m.label} satır toplamı ${m.rowTotal} kg, toplam alan ${m.total} kg`)
        .join('; ')

      return reviewResult(
        this.code,
        RuleSeverity.WARNING,
        `Çeki listesinde ağırlık toplamları satırlarla uyuşmuyor: ${detail}. Satır ağırlıkları ve toplam ağırlık alanları manuel kontrol edilmeli.`,
        internalMismatches.flatMap((m) => [
          { docType: DocumentType.PACKING_LIST, field: m.field, value: m.total },
          { docType: DocumentType.PACKING_LIST, field: `items[].${m.field}`, value: m.rowTotal },
        ]),
      )
    }

    return passResult(this.code, this.severity, 'Brüt ağırlık mevcut.')
  },
}
