/**
 * CandidateRule AI extraction — turns a mevzuat SourceDocument into DRAFT
 * candidate rules that admins review on the Kural Yönetimi page.
 *
 * Approved candidates create a `Rule` row (lifecycle APPROVED) plus a legal
 * citation, but they never auto-execute: `ALL_RULES` in @gumrukyz/rules stays
 * the only executable registry, so engine support remains a code change.
 */
import { z } from 'zod'
import { parseStructuredOutput } from '@gumrukyz/ai'
import { prisma } from '@gumrukyz/db'
import { estimateModelCostUsd, logger } from '@gumrukyz/shared'
import { openAIProviderUsageFields } from './provider-usage'

const DEFAULT_MODEL = 'gpt-5.4-mini'
const DEFAULT_TIMEOUT_MS = 90_000
const MAX_CANDIDATES = 8
const MAX_CORPUS_CHARS = 24_000
/** Bump when the extraction prompt or schema changes. */
const CANDIDATE_RULE_PROMPT_VERSION = '2026-06-10.1'

const CANDIDATE_DOC_TYPES = [
  'INVOICE',
  'PACKING_LIST',
  'LOADING_INSTRUCTION',
  'TRANSPORT_DOC',
  'DECLARATION_OUTPUT',
  'ORIGIN_DOC',
  'PERMIT_DOC',
] as const

const CandidateRuleItemSchema = z.object({
  rule_code_draft: z
    .string()
    .min(3)
    .max(24)
    .describe('Kısa taslak kod, ör. CAND-DECL-010 veya EXP-NEW-001'),
  name: z.string().min(5).max(160),
  description: z.string().min(20).max(800),
  applies_to_doc_types: z.array(z.enum(CANDIDATE_DOC_TYPES)).min(1).max(4),
  field_checks: z.array(z.string().min(1).max(60)).max(8),
  severity: z.enum(['ERROR', 'WARNING', 'INFO']),
  rationale: z.string().min(10).max(600),
  source_article: z.string().max(120).nullable(),
  confidence: z.number().min(0).max(1),
})

const CandidateRuleResponseSchema = z.object({
  candidates: z.array(CandidateRuleItemSchema).max(MAX_CANDIDATES),
  notes: z.string().max(600).nullable(),
})

export type CandidateRuleExtractionResult = {
  providerRunId: string
  createdCount: number
  skippedCodes: string[]
}

export async function extractCandidateRules(params: {
  sourceDocumentId: string
  tenantId: string
}): Promise<CandidateRuleExtractionResult> {
  const source = await prisma.sourceDocument.findUnique({
    where: { id: params.sourceDocumentId },
    include: {
      regulationChunks: {
        orderBy: { chunkIndex: 'asc' },
        select: { chunkText: true, articleLabel: true },
      },
    },
  })
  if (!source) {
    throw new Error(`SourceDocument ${params.sourceDocumentId} not found`)
  }

  const corpus = buildCorpus(source.rawExcerpt, source.regulationChunks)
  if (!corpus) {
    throw new Error(
      `SourceDocument ${params.sourceDocumentId} has no regulation chunks or raw excerpt to extract from`,
    )
  }

  const model = process.env['CANDIDATE_RULE_MODEL'] ?? DEFAULT_MODEL
  const startedAt = Date.now()
  const providerRun = await prisma.providerRun.create({
    data: {
      tenantId: params.tenantId,
      provider: 'openai',
      model,
      operation: 'candidate_rule_extraction',
      status: 'OK',
      promptVersion: CANDIDATE_RULE_PROMPT_VERSION,
    },
  })

  try {
    const { parsed, responseModel, inputTokens, outputTokens } =
      await parseStructuredOutput<z.infer<typeof CandidateRuleResponseSchema>>({
        model,
        schema: CandidateRuleResponseSchema,
        schemaName: 'candidate_rule_extraction',
        system:
          'Sen Türk gümrük mevzuatından deterministik kontrol kuralları çıkaran bir uzmansın. ' +
          'Yalnızca belge alanları üzerinden programatik olarak kontrol edilebilecek kurallar öner; ' +
          'metinde dayanağı olmayan kural üretme.',
        user: buildPrompt(source.title, corpus),
        maxOutputTokens: 4_000,
        timeoutMs: getTimeoutMs(),
        maxRetries: 1,
      })

    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        ...openAIProviderUsageFields({
          model: responseModel,
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimateModelCostUsd(model, inputTokens, outputTokens),
        }),
        durationMs: Date.now() - startedAt,
      },
    })

    const { createdCount, skippedCodes } = await persistCandidates({
      candidates: parsed.candidates,
      sourceDocumentId: source.id,
      tenantId: params.tenantId,
    })

    logger.info('Candidate rule extraction completed', {
      sourceDocumentId: source.id,
      createdCount,
      skippedCodes,
    })
    return { providerRunId: providerRun.id, createdCount, skippedCodes }
  } catch (err) {
    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        status: 'ERROR',
        errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        durationMs: Date.now() - startedAt,
      },
    })
    throw err
  }
}

function buildCorpus(
  rawExcerpt: string | null,
  chunks: Array<{ chunkText: string; articleLabel: string | null }>,
): string | null {
  const parts: string[] = []
  for (const chunk of chunks) {
    const label = chunk.articleLabel ? `[${chunk.articleLabel}] ` : ''
    parts.push(`${label}${chunk.chunkText.trim()}`)
  }
  if (parts.length === 0 && rawExcerpt?.trim()) {
    parts.push(rawExcerpt.trim())
  }
  if (parts.length === 0) return null

  let corpus = ''
  for (const part of parts) {
    if (corpus.length + part.length + 2 > MAX_CORPUS_CHARS) break
    corpus += `${part}\n\n`
  }
  return corpus.trim() || null
}

function buildPrompt(sourceTitle: string, corpus: string): string {
  return `Aşağıdaki mevzuat metninden gümrük dosyası kontrol kuralı adayları çıkar.

Kaynak: ${sourceTitle}

Kurallar:
- Her aday, belge ekstraksiyon alanları (ör. invoice_number, gtip_code, regime_code, total_amount) üzerinden deterministik olarak kontrol edilebilir olmalı.
- rule_code_draft "CAND-" ön ekiyle başlamalı (ör. CAND-DECL-001).
- field_checks içine kuralın okuyacağı alan adlarını yaz.
- rationale içinde kuralın dayandığı mevzuat ifadesini özetle; source_article alanına madde numarası/etiketi yaz (görünmüyorsa null).
- Metinde açık dayanağı olmayan veya yalnızca insan yorumu gerektiren yükümlülükler için aday üretme.
- En fazla ${MAX_CANDIDATES} aday döndür; hiçbiri yoksa boş liste döndür.

Mevzuat metni:
${corpus}`
}

async function persistCandidates(params: {
  candidates: Array<z.infer<typeof CandidateRuleItemSchema>>
  sourceDocumentId: string
  tenantId: string
}): Promise<{ createdCount: number; skippedCodes: string[] }> {
  const draftCodes = params.candidates.map((c) => c.rule_code_draft.toUpperCase().trim())

  const [existingRules, existingCandidates] = await Promise.all([
    prisma.rule.findMany({
      where: { ruleCode: { in: draftCodes } },
      select: { ruleCode: true },
    }),
    prisma.candidateRule.findMany({
      where: { ruleCodeDraft: { in: draftCodes }, status: { not: 'REJECTED' } },
      select: { ruleCodeDraft: true },
    }),
  ])
  const taken = new Set([
    ...existingRules.map((r) => r.ruleCode),
    ...existingCandidates.map((c) => c.ruleCodeDraft),
  ])

  let createdCount = 0
  const skippedCodes: string[] = []
  for (const candidate of params.candidates) {
    const code = candidate.rule_code_draft.toUpperCase().trim()
    if (taken.has(code)) {
      skippedCodes.push(code)
      continue
    }
    taken.add(code)

    const rationale = candidate.source_article
      ? `${candidate.rationale} (Dayanak: ${candidate.source_article})`
      : candidate.rationale

    await prisma.candidateRule.create({
      data: {
        ruleCodeDraft: code,
        description: `${candidate.name} — ${candidate.description}`,
        appliesToDocTypes: [...candidate.applies_to_doc_types],
        fieldChecks: candidate.field_checks,
        severity: candidate.severity,
        status: 'DRAFT',
        sourceDocumentId: params.sourceDocumentId,
        extractedRationale: rationale,
        aiConfidence: Math.max(0, Math.min(1, candidate.confidence)),
        tenantId: params.tenantId,
      },
    })
    createdCount++
  }

  return { createdCount, skippedCodes }
}

function getTimeoutMs(): number {
  const value = Number(process.env['CANDIDATE_RULE_TIMEOUT_MS'])
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS
}
