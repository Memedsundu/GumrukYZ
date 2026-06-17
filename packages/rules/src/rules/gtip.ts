import { DocumentType, RuleSeverity, isValidGtip } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import {
  failOrReview,
  failResult,
  findDocs,
  hasValue,
  passResult,
} from '../helpers.js'

function normalizeGtip(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

function normalizeGtipDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function areCompatibleGtipCodes(a: string, b: string): boolean {
  const left = normalizeGtip(a)
  const right = normalizeGtip(b)
  if (!left || !right) return false
  const shortest = Math.min(left.length, right.length)
  if (![8, 10, 12].includes(left.length) || ![8, 10, 12].includes(right.length)) return false
  return left.slice(0, shortest) === right.slice(0, shortest)
}

type DeclarationItemRow = Record<string, unknown>

/** Kalem (line item) rows extracted for a declaration, when the reader saw them. */
function declarationItems(data: Record<string, unknown>): DeclarationItemRow[] {
  const raw = data['items']
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is DeclarationItemRow => item != null && typeof item === 'object')
}

export const GTIP_002: RuleDefinition = {
  code: 'GTIP-002',
  name: 'Beyanname satırlarında eşya tanımı boş bırakılamaz',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const declarations = findDocs(ctx, DocumentType.DECLARATION_OUTPUT)
    if (declarations.length === 0) return null

    // Per-item check when kalem rows were extracted; header fallback otherwise.
    let missingItemLines = 0
    const missing = declarations.filter((d) => {
      const items = declarationItems(d.data)
      if (items.length > 0) {
        const blankItems = items.filter((item) => !hasValue(item['goods_description']))
        missingItemLines += blankItems.length
        return blankItems.length > 0
      }
      return !hasValue(d.data['goods_description'])
    })

    if (missing.length === 0) {
      return passResult(
        this.code,
        this.severity,
        'Beyannamenin tüm satırlarında eşya tanımı mevcut.',
      )
    }

    return failOrReview(
      this.code,
      this.severity,
      missing,
      missingItemLines > 0
        ? `Beyannamenin ${missingItemLines} kaleminde eşya tanımı (goods_description) eksik.`
        : 'Beyanname satırlarından birinde eşya tanımı (goods_description) eksik.',
      'Eşya tanımı beyannameden güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: DocumentType.DECLARATION_OUTPUT, field: 'goods_description' }],
    )
  },
}

export const GTIP_003: RuleDefinition = {
  code: 'GTIP-003',
  name: 'GTİP kodu fatura ve beyannamede tutarlı olmalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = findDocs(ctx, DocumentType.INVOICE)
    const declarations = findDocs(ctx, DocumentType.DECLARATION_OUTPUT)
    if (invoices.length === 0 || declarations.length === 0) return null

    // Multi-document pairing: every invoice GTİP must be compatible with at
    // least one declaration GTİP and vice versa. A naive first-vs-first (or
    // all-vs-all equality) comparison misfires on legitimate multi-invoice
    // declarations covering several tariff positions.
    const invoiceCodes = [...new Set(
      invoices
        .map((inv) => normalizeGtip(inv.data['gtip_code']))
        .filter((code): code is string => Boolean(code)),
    )]
    const declCodes = [...new Set(
      declarations
        .flatMap((decl) => {
          const itemCodes = declarationItems(decl.data)
            .map((item) => normalizeGtip(item['gtip_code']))
            .filter((code): code is string => Boolean(code))
          // Kalem-level codes supersede the header code when present.
          return itemCodes.length > 0 ? itemCodes : [normalizeGtip(decl.data['gtip_code'])]
        })
        .filter((code): code is string => Boolean(code)),
    )]
    if (invoiceCodes.length === 0 || declCodes.length === 0) return null

    const unmatchedInvoiceCodes = invoiceCodes.filter(
      (code) => !declCodes.some((declCode) => areCompatibleGtipCodes(code, declCode)),
    )
    const unmatchedDeclCodes = declCodes.filter(
      (code) => !invoiceCodes.some((invCode) => areCompatibleGtipCodes(invCode, code)),
    )

    if (unmatchedInvoiceCodes.length === 0 && unmatchedDeclCodes.length === 0) {
      return passResult(
        this.code,
        this.severity,
        `GTİP kodları uyumlu: fatura ${invoiceCodes.join(', ')} / beyanname ${declCodes.join(', ')}.`,
      )
    }

    const details: string[] = []
    if (unmatchedInvoiceCodes.length > 0) {
      details.push(`faturadaki "${unmatchedInvoiceCodes.join(', ')}" beyannamede karşılık bulamadı`)
    }
    if (unmatchedDeclCodes.length > 0) {
      details.push(`beyannamedeki "${unmatchedDeclCodes.join(', ')}" faturalarda karşılık bulamadı`)
    }

    return failResult(
      this.code,
      this.severity,
      `GTİP uyuşmazlığı: ${details.join('; ')}. HS sınıflandırmasını doğrulayın.`,
      [
        ...unmatchedInvoiceCodes.map((code) => ({
          docType: DocumentType.INVOICE,
          field: 'gtip_code',
          value: code,
        })),
        ...unmatchedDeclCodes.map((code) => ({
          docType: DocumentType.DECLARATION_OUTPUT,
          field: 'gtip_code',
          value: code,
        })),
      ],
    )
  },
}

export const GTIP_001: RuleDefinition = {
  code: 'GTIP-001',
  name: 'GTİP kodu 8 haneli sayısal olmalı',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const declarations = findDocs(ctx, DocumentType.DECLARATION_OUTPUT)
    const snapGtip = ctx.declarationSnapshot?.gtipCode
    if (declarations.length === 0 && !snapGtip) return null

    const allCodes: string[] = []
    for (const decl of declarations) {
      const items = declarationItems(decl.data)
      const itemCodes = items
        .map((item) => item['gtip_code'])
        .filter((code) => hasValue(code))
        .map((code) => String(code))
      if (itemCodes.length > 0) {
        // Multi-kalem declaration: validate every line's GTİP.
        allCodes.push(...itemCodes)
      } else {
        const code = decl.data['gtip_code']
        if (hasValue(code)) allCodes.push(String(code))
      }
    }
    if (snapGtip) allCodes.push(snapGtip)
    if (allCodes.length === 0) return null

    const validCodes = allCodes
      .filter((code) => isValidGtip(code))
      .map((code) => normalizeGtipDigits(code))
    const invalidCodes = allCodes.filter((code) => {
      if (isValidGtip(code)) return false
      const fragment = normalizeGtipDigits(code)
      if (fragment.length >= 4 && fragment.length < 8 && validCodes.some((valid) => valid.startsWith(fragment))) {
        return false
      }
      return true
    })

    if (invalidCodes.length === 0) {
      return passResult(this.code, this.severity, 'GTİP kod biçimi geçerli.')
    }

    return failResult(
      this.code,
      this.severity,
      `GTİP kodları "${invalidCodes.join(', ')}" 8, 10 veya 12 haneli sayısal kodlar değil. Alan: gtip_code.`,
      invalidCodes.map((c) => ({
        docType: DocumentType.DECLARATION_OUTPUT,
        field: 'gtip_code',
        value: c,
      })),
    )
  },
}
