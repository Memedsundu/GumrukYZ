import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { prisma, Prisma } from '@gumrukyz/db'
import type { ExtractionData } from '@gumrukyz/rules'
import { logger } from '@gumrukyz/shared'

const DEFAULT_MODEL = 'gpt-5.4-mini'
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_FINDINGS = 10

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
    },
  })

  try {
    const maxFindings = getMaxFindings()
    const schema = z.object({
      validations: z.array(AiRuleValidationItemSchema).max(maxFindings),
    })
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.responses.parse(
      {
        model,
        reasoning: { effort: 'low' },
        input: [
          {
            role: 'system',
            content:
              'Sen Türkiye gümrük kontrol sonuçlarını hızlıca ikinci göz olarak inceleyen yardımcı asistansın. Çıktı Türkçe ve yalnızca verilen belge, kural ve mevzuat kanıtına dayalı olmalıdır.',
          },
          {
            role: 'user',
            content: buildPrompt(params, maxFindings),
          },
        ],
        text: {
          format: zodTextFormat(schema, 'gumrukyz_ai_rule_validation'),
        },
        max_output_tokens: 4_000,
      },
      {
        timeout: getTimeoutMs(),
        maxRetries: 1,
      },
    )

    const parsed = response.output_parsed as z.infer<typeof schema> | null
    if (!parsed) throw new Error('OpenAI rule validation returned no parsed output')

    const allowedRuleResults = new Map(params.ruleResults.map((ruleResult) => [ruleResult.id, ruleResult]))
    const findings = parsed.validations
      .filter((validation) => allowedRuleResults.has(validation.rule_result_id))
      .slice(0, maxFindings)

    await prisma.$transaction(async (tx) => {
      await tx.providerRun.update({
        where: { id: providerRun.id },
        data: {
          model: String(response.model ?? model),
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          estimatedCostUsd: estimateCost(model, response.usage?.input_tokens, response.usage?.output_tokens),
          durationMs: Date.now() - startedAt,
        },
      })

      if (findings.length > 0) {
        await tx.aiRuleValidation.createMany({
          data: findings.map((finding) => ({
            ruleResultId: finding.rule_result_id,
            submissionId: params.submissionId,
            tenantId: params.tenantId,
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

function buildPrompt(params: {
  tradeFlow: string
  documents: ExtractionData[]
  ruleResults: RuleResultForAiValidation[]
}, maxFindings: number): string {
  const payload = {
    tradeFlow: params.tradeFlow,
    documents: params.documents.map((document) => ({
      docType: document.docType,
      confidence: document.confidence,
      data: compactJson(document.data),
    })),
    ruleResults: params.ruleResults.map((ruleResult) => ({
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
    })),
  }

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
- Eğer emin değilsen NEEDS_HUMAN_REVIEW kullan.

Veri:
${JSON.stringify(payload).slice(0, 26_000)}`
}

function compactJson(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === 'string' && nestedValue.length > 420) return `${nestedValue.slice(0, 420)}...`
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

function estimateCost(model: string, inputTokens?: number, outputTokens?: number): number | undefined {
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return undefined
  const normalized = model.toLowerCase()
  const rates = normalized.includes('gpt-5.4-mini')
    ? { input: 0.75, output: 4.5 }
    : { input: 2.5, output: 15 }
  return Math.round(((inputTokens * rates.input + outputTokens * rates.output) / 1_000_000) * 1_000_000) / 1_000_000
}
