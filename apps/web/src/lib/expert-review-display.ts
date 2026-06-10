export type ExpertEvidenceRef = {
  docType?: unknown
  field?: unknown
  value?: unknown
}

export type ExpertGtipCandidate = {
  code: string
  confidence: number
  rationale: string
  requiredEvidence: string[]
}

export type ExpertReviewForDisplay = {
  status: string
  summary: string | null
  /** Set when the submission was reprocessed after this review completed. */
  supersededAt?: Date | string | null
  findings: Array<{
    severity: string
    title: string
    explanation: string
    recommendation: string
    evidenceRefsJson?: unknown
    evidenceRefs?: unknown
  }>
}

export function shouldIntegrateExpertReview(review: ExpertReviewForDisplay | null | undefined): boolean {
  if (!review || review.supersededAt) return false
  return review.status === 'COMPLETED' || review.status === 'LEGAL_CONTEXT_INCOMPLETE'
}

export function countIntegratedExpertFindings(review: ExpertReviewForDisplay | null | undefined) {
  if (!shouldIntegrateExpertReview(review)) return { warnings: 0, reviewNeeded: 0 }
  return {
    warnings: review?.findings.filter((finding) => finding.severity === 'WARN').length ?? 0,
    reviewNeeded: review?.findings.filter((finding) => finding.severity === 'REVIEW_NEEDED').length ?? 0,
  }
}

export function mergeReportSummaryText(
  baseSummary: string | null,
  review: ExpertReviewForDisplay | null | undefined,
): string | null {
  const expertSummary = shouldIntegrateExpertReview(review) ? review?.summary?.trim() : null
  if (!baseSummary && !expertSummary) return null
  if (!expertSummary) return baseSummary
  if (!baseSummary) return `Uzman yapay zeka yorumu: ${expertSummary}`
  return `${baseSummary} Uzman yapay zeka yorumu: ${expertSummary}`
}

export function parseExpertEvidenceRefs(value: unknown): ExpertEvidenceRef[] {
  if (Array.isArray(value)) return value as ExpertEvidenceRef[]
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as { evidenceRefs?: unknown }
    if (Array.isArray(record.evidenceRefs)) return record.evidenceRefs as ExpertEvidenceRef[]
  }
  return []
}

/**
 * Reads GTİP candidates from the dedicated `gtipCandidatesJson` column
 * (plain array) with a fallback to the legacy format where candidates were
 * embedded inside `evidenceRefsJson` as `{ evidenceRefs, gtipCandidates }`.
 */
export function parseExpertGtipCandidates(value: unknown): ExpertGtipCandidate[] {
  let rawCandidates: unknown[] = []
  if (Array.isArray(value)) {
    rawCandidates = value
  } else if (value && typeof value === 'object') {
    const record = value as { gtipCandidates?: unknown }
    if (Array.isArray(record.gtipCandidates)) rawCandidates = record.gtipCandidates
  }
  if (rawCandidates.length === 0) return []
  return rawCandidates
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const candidate = item as {
        code?: unknown
        confidence?: unknown
        rationale?: unknown
        requiredEvidence?: unknown
      }
      const code = typeof candidate.code === 'string' ? candidate.code.trim() : ''
      const confidence = Number(candidate.confidence)
      const rationale = typeof candidate.rationale === 'string' ? candidate.rationale.trim() : ''
      const requiredEvidence = Array.isArray(candidate.requiredEvidence)
        ? candidate.requiredEvidence.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : []
      if (!code || !Number.isFinite(confidence) || !rationale) return null
      return {
        code,
        confidence: Math.max(0, Math.min(1, confidence)),
        rationale,
        requiredEvidence,
      }
    })
    .filter((item): item is ExpertGtipCandidate => Boolean(item))
}
