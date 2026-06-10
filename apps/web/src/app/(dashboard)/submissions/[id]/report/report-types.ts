export type ExpertQuota = {
  limit: number
  used: number
  remaining: number
  usedOn: string
  period: 'DAILY'
}

export type ReportCounts = {
  errors: number
  warnings: number
  reviewNeeded: number
  passes: number
}

export type ReportDocumentItem = {
  id: string
  filename: string
  label: string
  docType: string
  status: string
  isIgnored: boolean
  extractionConfidence: number | null
  classificationConfidence: number | null
}

export type ReportCitationItem = {
  id: string
  title: string
  label: string | null
  excerpt: string
  url: string
}

export type ReportAiValidationItem = {
  id: string
  statusLabel: string
  confidence: number
  explanation: string
  recommendation: string
}

export type ReportGtipCandidate = {
  code: string
  confidence: number
  rationale: string
  requiredEvidence: string[]
}

export type ReportFindingItem = {
  id: string
  kind: 'rule' | 'expert'
  code: string
  result: string
  resultLabel: string
  category: string
  sourceType: string
  title: string
  explanation: string
  message: string
  action: string
  blocking: boolean
  confidence: number | null
  sourceRefs: string[]
  citations: ReportCitationItem[]
  aiValidations: ReportAiValidationItem[]
  gtipCandidates: ReportGtipCandidate[]
  /** AI risk-summary explanation persisted for this specific finding. */
  summaryExplanation: string | null
  overrideReason: string | null
  canOverride: boolean
  defaultOpen: boolean
}
