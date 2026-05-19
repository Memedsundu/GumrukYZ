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

function areCompatibleGtipCodes(a: string, b: string): boolean {
  const left = normalizeGtip(a)
  const right = normalizeGtip(b)
  if (!left || !right) return false
  const shortest = Math.min(left.length, right.length)
  if (![8, 10, 12].includes(left.length) || ![8, 10, 12].includes(right.length)) return false
  return left.slice(0, shortest) === right.slice(0, shortest)
}

export const GTIP_002: RuleDefinition = {
  code: 'GTIP-002',
  name: 'Beyanname satırlarında eşya tanımı boş bırakılamaz',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const declarations = findDocs(ctx, DocumentType.DECLARATION_OUTPUT)
    if (declarations.length === 0) return null

    const missing = declarations.filter((d) => !hasValue(d.data['goods_description']))

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
      'Beyanname satırlarından birinde eşya tanımı (goods_description) eksik.',
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
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const decl = ctx.documents.find((d) => d.docType === DocumentType.DECLARATION_OUTPUT)

    if (!invoice || !decl) return null

    const invGtip = normalizeGtip(invoice.data['gtip_code'])
    const declGtip = normalizeGtip(decl.data['gtip_code'])

    if (!invGtip || !declGtip) return null

    if (areCompatibleGtipCodes(invGtip, declGtip)) {
      return passResult(
        this.code,
        this.severity,
        `GTİP kodları uyumlu: fatura ${invGtip} / beyanname ${declGtip}.`,
      )
    }

    return failResult(
      this.code,
      this.severity,
      `GTİP uyuşmazlığı: fatura "${invGtip}" ↔ beyanname "${declGtip}". HS sınıflandırmasını doğrulayın.`,
      [
        { docType: DocumentType.INVOICE, field: 'gtip_code', value: invGtip },
        { docType: DocumentType.DECLARATION_OUTPUT, field: 'gtip_code', value: declGtip },
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
      const code = decl.data['gtip_code']
      if (hasValue(code)) allCodes.push(String(code))
    }
    if (snapGtip) allCodes.push(snapGtip)
    if (allCodes.length === 0) return null

    const invalidCodes = allCodes.filter((code) => !isValidGtip(code))

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
