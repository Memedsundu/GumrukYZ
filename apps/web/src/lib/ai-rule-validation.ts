import { z } from 'zod'
import { parseStructuredOutput } from '@gumrukyz/ai'
import { prisma, Prisma } from '@gumrukyz/db'
import type { ExtractionData } from '@gumrukyz/rules'
import { estimateModelCostUsd, logger } from '@gumrukyz/shared'
import {
  AI_RULE_VALIDATION_SAFETY_GUARDRAILS,
  applyAiRuleValidationSafetyFilters,
} from './ai-rule-validation-safety'

const DEFAULT_MODEL = 'gpt-5.4-mini'
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_FINDINGS = 10
/** Bump when the validation prompt or schema changes. */
const RULE_VALIDATION_PROMPT_VERSION = '2026-06-17.0'

const ValidationStatusSchema = z.enum([
  'LIKELY_CORRECT',
  'POTENTIAL_FALSE_POSITIVE',
  'POTENTIAL_FALSE_NEGATIVE',
  'NEEDS_HUMAN_REVIEW',
])

const AiRuleValidationItemSchema = z.object({
  rule_result_id: z.string().min(1),
  status: ValidationStatusSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(800),
  recommendation: z.string().min(1).max(600),
  evidence_refs: z.array(
    z.object({
      docType: z.string().max(80).nullable(),
      field: z.string().max(120).nullable(),
      value: z.string().max(220).nullable(),
    }),
  ).max(5),
})

type RuleResultForAiValidation = {
  id: string
  ruleCode: string
  severity: string
  result: string
  message: string
  sourceRefsJson: unknown
  legalCitations: Array<{
    sourceTitle: string
    articleLabel: string | null
    excerpt: string
    url: string
  }>
}

export type AiRuleValidationSummary = {
  providerRunId: string
  validationCount: number
  findings: Array<{
    ruleResultId: string
    ruleCode: string
    status: string
    explanation: string
    recommendation: string
  }>
}

export function isAiRuleValidationEnabled(): boolean {
  if (process.env.OPENAI_RULE_VALIDATION_ENABLED === 'false') return false
  return Boolean(process.env.OPENAI_API_KEY)
}

export async function runAiRuleValidationForSubmission(params: {
  submissionId: string
  tenantId: string
  processingJobId?: string
  tradeFlow: string
  documents: ExtractionData[]
  ruleResults: RuleResultForAiValidation[]
}): Promise<AiRuleValidationSummary | null> {
  if (!isAiRuleValidationEnabled()) return null
  if (params.ruleResults.length === 0 || params.documents.length === 0) return null

  const model = process.env.OPENAI_RULE_VALIDATION_MODEL ?? DEFAULT_MODEL
  const startedAt = Date.now()
  const providerRun = await prisma.providerRun.create({
    data: {
      tenantId: params.tenantId,
      provider: 'openai',
      model,
      operation: 'ai_rule_validation',
      status: 'OK',
      promptVersion: RULE_VALIDATION_PROMPT_VERSION,
    },
  })

  try {
    const maxFindings = getMaxFindings()
    const schema = z.object({
      validations: z.array(AiRuleValidationItemSchema).max(maxFindings),
    })
    const { parsed, responseModel, inputTokens, outputTokens } = await parseStructuredOutput<z.infer<typeof schema>>({
      model,
      schema,
      schemaName: 'gumrukyz_ai_rule_validation',
      system:
        'Sen Türkiye gümrük kontrol sonuçlarını hızlıca ikinci göz olarak inceleyen yardımcı asistansın. Çıktı Türkçe ve yalnızca verilen belge, kural ve mevzuat kanıtına dayalı olmalıdır.',
      user: buildPrompt(params, maxFindings),
      reasoningEffort: 'low',
      maxOutputTokens: 4_000,
      timeoutMs: getTimeoutMs(),
      maxRetries: 1,
    })

    const allowedRuleResults = new Map(params.ruleResults.map((ruleResult) => [ruleResult.id, ruleResult]))
    const findings = applyAiRuleValidationSafetyFilters(
      parsed.validations
        .filter((validation) => allowedRuleResults.has(validation.rule_result_id))
        .slice(0, maxFindings),
      params.ruleResults,
    )

    await prisma.$transaction(async (tx) => {
      await tx.providerRun.update({
        where: { id: providerRun.id },
        data: {
          model: responseModel,
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimateModelCostUsd(model, inputTokens, outputTokens),
          durationMs: Date.now() - startedAt,
        },
      })

      if (findings.length > 0) {
        await tx.aiRuleValidation.createMany({
          data: findings.map((finding) => ({
            ruleResultId: finding.rule_result_id,
            submissionId: params.submissionId,
            tenantId: params.tenantId,
            processingJobId: params.processingJobId ?? null,
            providerRunId: providerRun.id,
            status: finding.status,
            confidence: normalizeConfidence(finding.confidence),
            explanation: finding.explanation,
            recommendation: finding.recommendation,
            evidenceRefsJson: finding.evidence_refs as Prisma.InputJsonValue,
          })),
        })
      }
    })

    return {
      providerRunId: providerRun.id,
      validationCount: findings.length,
      findings: findings.map((finding) => ({
        ruleResultId: finding.rule_result_id,
        ruleCode: allowedRuleResults.get(finding.rule_result_id)?.ruleCode ?? 'UNKNOWN',
        status: finding.status,
        explanation: finding.explanation,
        recommendation: finding.recommendation,
      })),
    }
  } catch (error) {
    logger.warn('AI rule validation failed, continuing processing', {
      error: error instanceof Error ? error.message : String(error),
    })
    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        status: 'ERROR',
        errorMessage: error instanceof Error ? error.message : 'AI rule validation failed',
        durationMs: Date.now() - startedAt,
      },
    })
    return null
  }
}

const PROMPT_PAYLOAD_BUDGET = 26_000
const MIN_DOCUMENT_BUDGET = 2_000

function buildPrompt(params: {
  tradeFlow: string
  documents: ExtractionData[]
  ruleResults: RuleResultForAiValidation[]
}, maxFindings: number): string {
  // Rule results carry the rule_result_ids the model must echo back, so they
  // are serialized first and never truncated. Documents fill the remaining
  // budget with progressively more aggressive compaction — a large document
  // set can no longer push the rule results (and their IDs) out of the prompt.
  const ruleResultsJson = JSON.stringify(params.ruleResults.map((ruleResult) => ({
    id: ruleResult.id,
    ruleCode: ruleResult.ruleCode,
    severity: ruleResult.severity,
    result: ruleResult.result,
    message: ruleResult.message,
    sourceRefs: ruleResult.sourceRefsJson,
    legalCitations: ruleResult.legalCitations.map((citation) => ({
      sourceTitle: citation.sourceTitle,
      articleLabel: citation.articleLabel,
      excerpt: citation.excerpt.slice(0, 320),
      url: citation.url,
    })),
  })))

  const documentBudget = Math.max(PROMPT_PAYLOAD_BUDGET - ruleResultsJson.length, MIN_DOCUMENT_BUDGET)
  const documentsJson = serializeDocumentsWithinBudget(params.documents, documentBudget)

  const payloadJson = `{"tradeFlow":${JSON.stringify(params.tradeFlow)},"ruleResults":${ruleResultsJson},"documents":${documentsJson}}`

  return `Deterministik gümrük kural sonuçlarını kullanıcıya yardımcı olacak şekilde ikinci göz olarak kontrol et.

Amaç:
- Deterministik sonucu değiştirme.
- Sadece kullanıcıya yardımcı olacak danışma bulguları üret.
- Potansiyel yanlış pozitifleri, potansiyel kaçan riskleri ve insan incelemesi gereken belirsizlikleri işaretle.

Durum değerleri:
- LIKELY_CORRECT: kural sonucu verilen belge kanıtıyla uyumlu görünüyor.
- POTENTIAL_FALSE_POSITIVE: kural sonucu muhtemelen teknik/okuma/birim farkından kaynaklanıyor olabilir.
- POTENTIAL_FALSE_NEGATIVE: kural geçmiş olsa da belge verisinde kaçan risk olabilir.
- NEEDS_HUMAN_REVIEW: yorum veya alan doğrulaması gerekiyor.

Kesin kurallar:
- Türkçe yaz.
- Sonuçları değiştirme, FAIL/WARN/PASS üretme.
- Verilen rule_result_id dışında ID uydurma.
- En fazla ${maxFindings} doğrulama döndür.
- Yalnızca anlamlı bulgu döndür; her geçen kontrol için gereksiz yorum yazma.
- Mevzuat atfı uydurma; sadece payload içindeki legalCitations bağlamını kullan.
- Ağırlık, kıymet veya miktar farkı 980.00/98000, 1,185.00/1.185 veya 33,600.00/33.600 gibi ondalık-binlik ayırıcı farkına benziyorsa POTENTIAL_FALSE_POSITIVE kullan ve kaynak belgedeki sayı formatının doğrulanmasını öner.
- Ek güvenlik kuralları:
${AI_RULE_VALIDATION_SAFETY_GUARDRAILS}
- Eğer emin değilsen NEEDS_HUMAN_REVIEW kullan.

Veri:
${payloadJson}`
}

/**
 * Serializes documents into a JSON array string that fits the given character
 * budget, trying progressively more aggressive compaction levels: full data
 * with long strings truncated, then shorter string truncation, then metadata
 * only (docType + confidence). Always returns valid JSON.
 */
function serializeDocumentsWithinBudget(documents: ExtractionData[], budget: number): string {
  const levels: Array<(document: ExtractionData) => unknown> = [
    (document) => ({
      docType: document.docType,
      confidence: document.confidence,
      data: compactJson(document.data, 420),
    }),
    (document) => ({
      docType: document.docType,
      confidence: document.confidence,
      data: compactJson(document.data, 160),
    }),
    (document) => ({
      docType: document.docType,
      confidence: document.confidence,
    }),
  ]

  let serialized = '[]'
  for (const level of levels) {
    serialized = JSON.stringify(documents.map(level))
    if (serialized.length <= budget) return serialized
  }
  return JSON.stringify(documents.map(levels[levels.length - 1]!))
}

function compactJson(value: unknown, maxStringLength = 420): unknown {
  if (!value || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === 'string' && nestedValue.length > maxStringLength) {
      return `${nestedValue.slice(0, maxStringLength)}...`
    }
    return nestedValue
  }))
}

function getMaxFindings(): number {
  const configured = Number(process.env.OPENAI_RULE_VALIDATION_MAX_FINDINGS ?? DEFAULT_MAX_FINDINGS)
  return Number.isFinite(configured) ? Math.max(1, Math.min(20, Math.round(configured))) : DEFAULT_MAX_FINDINGS
}

function getTimeoutMs(): number {
  const configured = Number(process.env.OPENAI_RULE_VALIDATION_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  return Number.isFinite(configured) ? configured : DEFAULT_TIMEOUT_MS
}

function normalizeConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100))
}
