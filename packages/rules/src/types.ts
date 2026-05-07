import type { DocumentType, RuleSeverity, RuleResultOutcome, TradeFlow } from '@gumrukyz/domain'

export interface ExtractionData {
  docType: DocumentType
  data: Record<string, unknown>
  confidence: number
}

export interface SubmissionContext {
  submissionId: string
  tenantId: string
  tradeFlow: TradeFlow
  documents: ExtractionData[]
  declarationSnapshot?: DeclarationSnapshotData | null
}

export interface DeclarationSnapshotData {
  declarationNumber?: string | null
  incoterm?: string | null
  totalValue?: number | null
  currency?: string | null
  totalNetWeight?: number | null
  totalGrossWeight?: number | null
  packageCount?: number | null
  gtipCode?: string | null
  regimeCode?: string | null
}

export interface RuleEvaluationResult {
  ruleCode: string
  severity: RuleSeverity
  result: RuleResultOutcome
  message: string
  sourceRefs: Array<{
    docType?: string
    field?: string
    value?: unknown
  }>
}

export interface RuleDefinition {
  code: string
  name: string
  severity: RuleSeverity
  appliesToDocTypes: DocumentType[]
  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null
}
