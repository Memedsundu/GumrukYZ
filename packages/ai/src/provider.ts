import { z } from 'zod'
import type { DocumentType, TradeFlow } from '@gumrukyz/domain'

export interface DocumentClassificationResult {
  detectedType: DocumentType
  confidence: number
  reasoning: string
  detectedTradeFlow?: TradeFlow
  tradeFlowConfidence?: number
  sourceRefs?: Array<{
    field: string
    value: string
  }>
  parties?: Array<{
    role: string
    name: string | null
    taxId?: string | null
    address?: string | null
    country?: string | null
  }>
}

export interface ExtractionResult {
  structuredData: Record<string, unknown>
  confidence: number
  rawText?: string
}

export interface RiskSummaryFindingInput {
  /**
   * Stable identifier the model must echo back so explanations can be joined
   * to specific findings. Rule codes are NOT unique (multiple results can
   * share a code, and AI-rule findings use synthetic codes).
   */
  findingId: string
  ruleCode: string
  severity: string
  message: string
}

export interface ExplanationResult {
  summary: string
  findingExplanations: Array<{
    findingId: string
    ruleCode: string
    explanation: string
  }>
}

export interface RiskSummaryCoverageContext {
  presentLabels: string[]
  missingExpectedLabels: string[]
  missingConditionalLabels: string[]
  missingReferencedInvoiceLabels?: string[]
  limitationNotice: string
}

export interface ProviderRunMetadata {
  provider: string
  model: string
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number
  durationMs?: number
}

export interface LlmProvider {
  classifyDocument(
    rawText: string,
    filename: string,
  ): Promise<{ result: DocumentClassificationResult; meta: ProviderRunMetadata }>

  extractStructured<T>(
    rawText: string,
    schema: z.ZodType<T>,
    schemaName: string,
    docType: DocumentType,
  ): Promise<{ result: T; meta: ProviderRunMetadata }>

  generateRiskSummary(
    findings: RiskSummaryFindingInput[],
    tradeFlow: string,
    regulationContext?: Array<{ title: string; excerpt: string }>,
    documentCoverage?: RiskSummaryCoverageContext,
  ): Promise<{ result: ExplanationResult; meta: ProviderRunMetadata }>

  embedText?(text: string): Promise<number[]>

  isEnabled(): boolean
}
