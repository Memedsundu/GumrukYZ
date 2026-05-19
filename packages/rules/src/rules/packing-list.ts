import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, RuleEvaluationResult, SubmissionContext } from '../types.js'
import {
  failOrReview,
  findDocs,
  hasValue,
  passResult,
  toFiniteNumber,
} from '../helpers.js'

function getPackingLists(ctx: SubmissionContext) {
  return findDocs(ctx, DocumentType.PACKING_LIST)
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

    if (offenders.length === 0) {
      return passResult(this.code, this.severity, 'Paket sayısı geçerli.')
    }

    return failOrReview(
      this.code,
      this.severity,
      offenders,
      'Çeki listesinde paket sayısı eksik veya pozitif tam sayı değil. Alan: package_count.',
      'Çeki listesinden paket sayısı güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: DocumentType.PACKING_LIST, field: 'package_count' }],
    )
  },
}

export const PL_002: RuleDefinition = {
  code: 'PL-002',
  name: 'Brüt ağırlık bulunmalı',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const pls = getPackingLists(ctx)
    if (pls.length === 0) return null

    const offenders = pls.filter((pl) => {
      const weight = toFiniteNumber(pl.data['gross_weight'])
      return weight == null || weight <= 0 || !hasValue(pl.data['gross_weight'])
    })

    if (offenders.length === 0) {
      return passResult(this.code, this.severity, 'Brüt ağırlık mevcut.')
    }

    return failOrReview(
      this.code,
      this.severity,
      offenders,
      'Çeki listesinde brüt ağırlık eksik veya pozitif değil. Alan: gross_weight.',
      'Çeki listesinden brüt ağırlık güvenle okunamadı. Manuel kontrol gerekli.',
      [{ docType: DocumentType.PACKING_LIST, field: 'gross_weight' }],
    )
  },
}
