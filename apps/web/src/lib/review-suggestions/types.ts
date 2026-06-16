import { z } from 'zod'

export type SuggestionLanguage = 'tr' | 'en'

export type OverallRisk = 'low' | 'medium' | 'high'

export type IssueSeverity = 'low' | 'medium' | 'high'

export type IssueType =
  | 'gtip_risk'
  | 'value_mismatch'
  | 'weight_mismatch'
  | 'origin_issue'
  | 'missing_document'
  | 'missing_field'
  | 'document_reference_mismatch'
  | 'ocr_uncertainty'
  | 'regime_risk'
  | 'quantity_mismatch'
  | 'currency_issue'
  | 'technical_verification_needed'

export type SuggestionType =
  | 'explain_issue'
  | 'show_evidence'
  | 'prepare_note'
  | 'summarize'
  | 'checklist'
  | 'ask_clarification'
  | 'compare_documents'
  | 'manual_review'

export interface SuggestionEvidence {
  document: string
  page: number
  field: string
  value: string
}

export interface SuggestionInputIssue {
  issue_id: string
  issue_type: IssueType
  severity: IssueSeverity
  confidence: number
  title: string
  description: string
  evidence: SuggestionEvidence[]
  recommended_action: string
}

export interface OcrUncertainField {
  document: string
  page: number
  field: string
  value: string
}

/** Normalized review snapshot consumed by the suggestion generator. */
export interface SuggestionInput {
  case_id: string
  language: SuggestionLanguage
  document_types_uploaded: string[]
  overall_risk: OverallRisk
  issues: SuggestionInputIssue[]
  missing_documents: string[]
  ocr_uncertain_fields: OcrUncertainField[]
}

export interface Suggestion {
  id: string
  label: string
  type: SuggestionType
  priority: number
  linked_issue_ids: string[]
  prompt_to_assistant: string
}

export interface SuggestionsResult {
  assistant_intro: string
  suggestions: Suggestion[]
}

/** The mini-model only writes the short intro sentence; chips are deterministic. */
export const AssistantIntroSchema = z.object({
  assistant_intro: z.string().min(1).max(180),
})
export type AssistantIntroResponse = z.infer<typeof AssistantIntroSchema>
