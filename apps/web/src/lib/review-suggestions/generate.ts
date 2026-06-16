import { parseStructuredOutput } from '@gumrukyz/ai'
import { logger } from '@gumrukyz/shared'
import {
  generalChipTemplate,
  issueChipTemplate,
  type GeneralChipKind,
} from './catalog'
import { AssistantIntroSchema } from './types'
import type {
  IssueType,
  Suggestion,
  SuggestionInput,
  SuggestionsResult,
} from './types'

const SUGGESTIONS_MODEL = process.env['OPENAI_SUGGESTIONS_MODEL'] ?? 'gpt-5.4-mini'
const MAX_SUGGESTIONS = 6
const MIN_SUGGESTIONS = 3
const LOW_CONFIDENCE = 0.6

const MISMATCH_TYPES = new Set<IssueType>([
  'value_mismatch',
  'weight_mismatch',
  'quantity_mismatch',
  'document_reference_mismatch',
  'currency_issue',
])

const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

interface Candidate {
  key: string
  label: string
  type: Suggestion['type']
  priority: number
  linked_issue_ids: string[]
  prompt_to_assistant: string
  order: number
}

function issueChipPriority(type: IssueType, severityRank: number, minConfidence: number): number {
  if (type === 'missing_document') return 4
  if (type === 'ocr_uncertainty') return 6
  let base = severityRank === 3 ? 2 : severityRank === 2 ? 5 : 7
  if (minConfidence < LOW_CONFIDENCE) base = Math.min(base, 3)
  return base
}

const GENERAL_PRIORITY: Record<GeneralChipKind, number> = {
  manual_review: 1,
  high_risk_summary: 2,
  importer_note: 6,
  clean_summary: 8,
  pre_submit_checklist: 8,
  internal_note: 9,
}

/** Build the deterministic suggestion chips per the agent's predefined logic. */
export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const lang = input.language
  const candidates = new Map<string, Candidate>()
  let order = 0

  const addGeneral = (kind: GeneralChipKind) => {
    const key = `gen:${kind}`
    if (candidates.has(key)) return
    const tpl = generalChipTemplate(kind, lang)
    candidates.set(key, {
      key,
      label: tpl.label,
      type: tpl.type,
      priority: GENERAL_PRIORITY[kind],
      linked_issue_ids: [],
      prompt_to_assistant: tpl.prompt,
      order: order++,
    })
  }

  const ensureIssueChip = (type: IssueType, linkedIds: string[], priority: number) => {
    const key = `issue:${type}`
    const existing = candidates.get(key)
    if (existing) {
      for (const id of linkedIds) {
        if (id && !existing.linked_issue_ids.includes(id)) existing.linked_issue_ids.push(id)
      }
      existing.priority = Math.min(existing.priority, priority)
      return
    }
    const tpl = issueChipTemplate(type, lang)
    candidates.set(key, {
      key,
      label: tpl.label,
      type: tpl.type,
      priority,
      linked_issue_ids: linkedIds.filter(Boolean),
      prompt_to_assistant: tpl.prompt,
      order: order++,
    })
  }

  // Group issues by type.
  const groups = new Map<IssueType, { ids: string[]; severityRank: number; minConfidence: number }>()
  for (const issue of input.issues) {
    const group = groups.get(issue.issue_type) ?? { ids: [], severityRank: 0, minConfidence: 1 }
    group.ids.push(issue.issue_id)
    group.severityRank = Math.max(group.severityRank, SEVERITY_RANK[issue.severity] ?? 1)
    group.minConfidence = Math.min(group.minConfidence, issue.confidence)
    groups.set(issue.issue_type, group)
  }

  for (const [type, group] of groups) {
    ensureIssueChip(type, group.ids, issueChipPriority(type, group.severityRank, group.minConfidence))
  }

  // Missing documents / OCR that have no backing issue chip yet.
  if (input.missing_documents.length > 0 && !candidates.has('issue:missing_document')) {
    ensureIssueChip('missing_document', [], 4)
  }
  if (input.ocr_uncertain_fields.length > 0 && !candidates.has('issue:ocr_uncertainty')) {
    ensureIssueChip('ocr_uncertainty', [], 6)
  }

  const hasHighSeverity = input.issues.some((issue) => issue.severity === 'high')
  const hasMismatch = input.issues.some((issue) => MISMATCH_TYPES.has(issue.issue_type))

  if (input.issues.length === 0) {
    // No serious issues → positive workflow suggestions.
    addGeneral('clean_summary')
    addGeneral('pre_submit_checklist')
    addGeneral('internal_note')
  } else {
    if (input.overall_risk === 'high') addGeneral('high_risk_summary')
    if (hasHighSeverity) addGeneral('manual_review')
    if (hasMismatch) addGeneral('importer_note')
  }

  // Pad to the minimum with safe general chips.
  const PADDING: GeneralChipKind[] = ['pre_submit_checklist', 'internal_note', 'high_risk_summary']
  for (const kind of PADDING) {
    if (candidates.size >= MIN_SUGGESTIONS) break
    addGeneral(kind)
  }

  const sorted = Array.from(candidates.values()).sort(
    (a, b) => a.priority - b.priority || a.order - b.order,
  )

  return sorted.slice(0, MAX_SUGGESTIONS).map((candidate, index) => ({
    id: `SUG-${String(index + 1).padStart(3, '0')}`,
    label: candidate.label,
    type: candidate.type,
    priority: index + 1,
    linked_issue_ids: candidate.linked_issue_ids,
    prompt_to_assistant: candidate.prompt_to_assistant,
  }))
}

function deterministicIntro(input: SuggestionInput): string {
  const tr = input.language !== 'en'
  if (input.issues.length === 0) {
    return tr
      ? 'Bu dosyada önemli bir risk görünmüyor; son kontroller için öneriler aşağıda.'
      : 'No significant risk detected in this file; suggestions for final checks are below.'
  }
  if (input.overall_risk === 'high') {
    return tr
      ? 'Bu dosyada yüksek riskli bulgular var; öncelikli kontrol adımları aşağıda.'
      : 'This file has high-risk findings; priority check steps are below.'
  }
  return tr
    ? 'Bu dosyada kontrol edilmesi gereken noktalar var; aşağıdaki öneriler yardımcı olabilir.'
    : 'This file has points to verify; the suggestions below can help.'
}

/** Ask the mini model for a single short intro sentence (safe summary only). */
async function generateIntro(
  input: SuggestionInput,
  suggestions: Suggestion[],
): Promise<string> {
  if (!process.env['OPENAI_API_KEY']) return deterministicIntro(input)

  const counts = {
    high: input.issues.filter((i) => i.severity === 'high').length,
    medium: input.issues.filter((i) => i.severity === 'medium').length,
    low: input.issues.filter((i) => i.severity === 'low').length,
  }
  // Only structured/aggregate data is sent — never raw document text — so
  // document content cannot inject instructions into the model.
  const safeSummary = JSON.stringify({
    language: input.language,
    overall_risk: input.overall_risk,
    issue_counts: counts,
    missing_documents: input.missing_documents.length,
    ocr_uncertain_fields: input.ocr_uncertain_fields.length,
    suggestion_labels: suggestions.map((s) => s.label),
  })

  try {
    const { parsed } = await parseStructuredOutput<{ assistant_intro: string }>({
      model: SUGGESTIONS_MODEL,
      schema: AssistantIntroSchema,
      schemaName: 'gumrukyz_suggestion_intro',
      system:
        input.language === 'en'
          ? 'You write ONE short, cautious sentence to display above customs review suggestion buttons. Use careful language (should be checked, may require verification). Never claim legal correctness. Output only the JSON field.'
          : 'Gümrük inceleme öneri butonlarının üstünde gösterilecek TEK kısa ve dikkatli cümle yazarsın. Temkinli dil kullan (kontrol edilmeli, doğrulama gerekebilir). Yasal kesinlik iddia etme. Sadece JSON alanını döndür.',
      user: safeSummary,
      reasoningEffort: 'low',
      maxOutputTokens: 200,
      timeoutMs: 15_000,
      maxRetries: 1,
    })
    const intro = parsed.assistant_intro?.trim()
    return intro && intro.length > 0 ? intro : deterministicIntro(input)
  } catch (error) {
    logger.warn('suggestion intro generation failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return deterministicIntro(input)
  }
}

export async function generateSuggestions(input: SuggestionInput): Promise<SuggestionsResult> {
  const suggestions = buildSuggestions(input)
  const assistant_intro = await generateIntro(input, suggestions)
  return { assistant_intro, suggestions }
}
