import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { prisma, Prisma } from '@gumrukyz/db'
import type { ExtractionData } from '@gumrukyz/rules'
import { logger } from '@gumrukyz/shared'

const DEFAULT_MODEL = 'gpt-5.4'
const DEFAULT_REASONING_EFFORT = 'medium'
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_FINDINGS = 8
const DEFAULT_MAX_OUTPUT_TOKENS = 10_000
const LEGAL_CONTEXT_CHUNK_LIMIT = 10
const LEGAL_CONTEXT_EXCERPT_CHARS = 650
const PROMPT_PAYLOAD_CHARS = 24_000
const RETRY_CONTEXT_CHUNK_LIMIT = 6
const RETRY_PROMPT_PAYLOAD_CHARS = 14_000
const RETRY_MAX_FINDINGS = 4

export const REQUIRED_LEGAL_SOURCE_TITLES = [
  '4458 Sayılı Gümrük Kanunu',
  'Gümrük Yönetmeliği',
  'Türk Gümrük Tarife Cetveli',
  'Türkiye Ürün Kuralları Veri Tabanı - Sektörel Mevzuat',
  'GTİP Arama Motoru',
  'WCO HS Nomenclature 2022',
]

const ExpertFindingSchema = z.object({
  area: z.enum([
    'GTIP_PLAUSIBILITY',
    'PERMIT_PRODUCT_CONTROL',
    'REGIME_CHOICE',
    'VALUATION',
    'ORIGIN_PREFERENTIAL',
    'INCOTERM',
    'DOCUMENT_CONSISTENCY',
    'LEGAL_CONTEXT',
  ]),
  severity: z.enum(['WARN', 'REVIEW_NEEDED']),
  confidence: z.number().min(0).max(1),
  title: z.string().min(1).max(160),
  explanation: z.string().min(1).max(900),
  recommendation: z.string().min(1).max(600),
  evidence_refs: z.array(
    z.object({
      docType: z.string().max(80),
      field: z.string().max(120).nullable(),
      value: z.string().max(180).nullable(),
    }),
  ).max(5),
  citation_chunk_ids: z.array(z.string()).max(3),
})

const OverallRiskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'])

type LegalContextChunk = {
  id: string
  chunkText: string
  articleLabel: string | null
  sourceUrl: string | null
  sourceTitle: string
  sourceType: string
  jurisdiction: string
  verifiedAt: Date | null
  similarity?: number
}

type RuleResultForExpertReview = {
  ruleCode: string
  severity: string
  result: string
  message: string
  sourceRefsJson: unknown
}

type ExpertReviewResponse = {
  overall_risk: z.infer<typeof OverallRiskSchema>
  summary: string
  findings: Array<z.infer<typeof ExpertFindingSchema>>
}

type ParsedExpertReviewResponse = {
  parsed: ExpertReviewResponse
  responseModel: string
  inputTokens?: number
  outputTokens?: number
  contextChunks: LegalContextChunk[]
}

export type ExpertReviewSummary = {
  id: string
  status: string
  legalContextStatus: string
  overallRisk: string | null
  summary: string | null
  warningCount: number
  reviewNeededCount: number
  findings: Array<{
    area: string
    severity: string
    title: string
    explanation: string
  }>
}

export function isExpertReviewEnabled(): boolean {
  if (process.env.OPENAI_EXPERT_REVIEW_ENABLED === 'false') return false
  return Boolean(process.env.OPENAI_API_KEY)
}

export async function runExpertReviewForSubmission(params: {
  submissionId: string
  tenantId: string
  tradeFlow: string
  documents: ExtractionData[]
  ruleResults: RuleResultForExpertReview[]
}): Promise<ExpertReviewSummary | null> {
  if (!isExpertReviewEnabled()) {
    return createSkippedExpertReview(params, 'AI uzman incelemesi OpenAI yapılandırması olmadığı için atlandı.')
  }

  const readiness = await getLegalContextReadiness()
  if (readiness.missingRequiredSources.length > 0) {
    return createLegalContextIncompleteReview(params, readiness.missingRequiredSources)
  }

  const model = process.env.OPENAI_EXPERT_REVIEW_MODEL ?? DEFAULT_MODEL
  const startedAt = Date.now()
  const providerRun = await prisma.providerRun.create({
    data: {
      tenantId: params.tenantId,
      provider: 'openai',
      model,
      operation: 'expert_review',
      status: 'OK',
    },
  })

  const review = await prisma.expertReview.create({
    data: {
      submissionId: params.submissionId,
      tenantId: params.tenantId,
      providerRunId: providerRun.id,
      status: 'RUNNING',
      legalContextStatus: 'READY',
      model,
    },
  })

  try {
    const contextChunks = await retrieveLegalContext(params)
    if (contextChunks.length === 0) {
      await prisma.providerRun.update({
        where: { id: providerRun.id },
        data: { durationMs: Date.now() - startedAt },
      })
      return completeReviewWithContextFinding(review.id, params.tenantId, 'LEGAL_CONTEXT_INCOMPLETE', [
        'İlgili mevzuat parçaları bulunamadı.',
      ])
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const generated = await requestParsedExpertReview({
      openai,
      model,
      params,
      contextChunks,
      maxFindings: getMaxFindings(),
      contextLimit: LEGAL_CONTEXT_CHUNK_LIMIT,
      payloadLimit: PROMPT_PAYLOAD_CHARS,
    })

    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        model: generated.responseModel,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
        estimatedCostUsd: estimateCost(model, generated.inputTokens, generated.outputTokens),
        durationMs: Date.now() - startedAt,
      },
    })

    return persistExpertReview({
      reviewId: review.id,
      tenantId: params.tenantId,
      legalContextStatus: 'READY',
      overallRisk: generated.parsed.overall_risk,
      summary: generated.parsed.summary,
      findings: generated.parsed.findings,
      allowedChunks: generated.contextChunks,
    })
  } catch (error) {
    logger.warn('AI expert review failed, continuing report generation', {
      error: error instanceof Error ? error.message : String(error),
    })
    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        status: 'ERROR',
        errorMessage: error instanceof Error ? error.message : 'AI expert review failed',
        durationMs: Date.now() - startedAt,
      },
    })
    await prisma.expertReview.update({
      where: { id: review.id },
      data: {
        status: 'ERROR',
        summary: 'AI uzman incelemesi tamamlanamadı; deterministik kontroller üzerinden rapor üretildi.',
        completedAt: new Date(),
      },
    })
    return {
      id: review.id,
      status: 'ERROR',
      legalContextStatus: 'READY',
      overallRisk: null,
      summary: 'AI uzman incelemesi tamamlanamadı; deterministik kontroller üzerinden rapor üretildi.',
      warningCount: 0,
      reviewNeededCount: 0,
      findings: [],
    }
  }
}

async function createSkippedExpertReview(
  params: {
    submissionId: string
    tenantId: string
  },
  summary: string,
): Promise<ExpertReviewSummary> {
  const review = await prisma.expertReview.create({
    data: {
      submissionId: params.submissionId,
      tenantId: params.tenantId,
      status: 'SKIPPED',
      legalContextStatus: 'NOT_RUN',
      summary,
      overallRisk: 'UNKNOWN',
      completedAt: new Date(),
    },
  })
  return {
    id: review.id,
    status: review.status,
    legalContextStatus: review.legalContextStatus,
    overallRisk: review.overallRisk,
    summary: review.summary,
    warningCount: 0,
    reviewNeededCount: 0,
    findings: [],
  }
}

async function createLegalContextIncompleteReview(
  params: {
    submissionId: string
    tenantId: string
  },
  missingSources: string[],
): Promise<ExpertReviewSummary> {
  const review = await prisma.expertReview.create({
    data: {
      submissionId: params.submissionId,
      tenantId: params.tenantId,
      status: 'LEGAL_CONTEXT_INCOMPLETE',
      legalContextStatus: 'LEGAL_CONTEXT_INCOMPLETE',
      overallRisk: 'UNKNOWN',
      summary:
        'AI uzman incelemesi için gerekli mevzuat kapsamı eksik. GTİP, ürün kontrolü veya yorum gerektiren alanlarda manuel uzman incelemesi gerekir.',
      completedAt: new Date(),
    },
  })
  return completeReviewWithContextFinding(review.id, params.tenantId, 'LEGAL_CONTEXT_INCOMPLETE', missingSources)
}

async function completeReviewWithContextFinding(
  reviewId: string,
  tenantId: string,
  legalContextStatus: string,
  missingSources: string[],
): Promise<ExpertReviewSummary> {
  const title = 'Mevzuat bağlamı eksik'
  const explanation = `AI uzman incelemesi için gerekli kaynaklar eksik veya gömülü mevzuat parçası bulunamadı: ${missingSources.join(', ')}. Bu nedenle GTİP/ürün kontrolü gibi yoruma açık alanlarda manuel uzman incelemesi gerekir.`
  const recommendation = 'Eksik resmi mevzuat kaynaklarını içe aktarın ve analizi tekrar çalıştırın.'

  await prisma.expertReview.update({
    where: { id: reviewId },
    data: {
      status: legalContextStatus,
      legalContextStatus,
      overallRisk: 'UNKNOWN',
      completedAt: new Date(),
    },
  })
  await prisma.expertReviewFinding.create({
    data: {
      expertReviewId: reviewId,
      tenantId,
      area: 'LEGAL_CONTEXT',
      severity: 'REVIEW_NEEDED',
      confidence: 1,
      title,
      explanation,
      recommendation,
      evidenceRefsJson: [{ field: 'legal_context', value: missingSources.join(', ') }] as Prisma.InputJsonValue,
    },
  })

  return {
    id: reviewId,
    status: legalContextStatus,
    legalContextStatus,
    overallRisk: 'UNKNOWN',
    summary: 'AI uzman incelemesi için gerekli mevzuat kapsamı eksik.',
    warningCount: 0,
    reviewNeededCount: 1,
    findings: [{ area: 'LEGAL_CONTEXT', severity: 'REVIEW_NEEDED', title, explanation }],
  }
}

export async function getLegalContextReadiness(): Promise<{ missingRequiredSources: string[] }> {
  const rows = await prisma.$queryRaw<Array<{
    title: string
    chunk_count: bigint
    embedded_count: bigint
  }>>`
    SELECT
      sd.title,
      COUNT(rc.id)::bigint AS chunk_count,
      COUNT(rc.embedding)::bigint AS embedded_count
    FROM source_documents sd
    LEFT JOIN regulation_chunks rc ON rc.source_document_id = sd.id
    WHERE sd.title IN (${Prisma.join(REQUIRED_LEGAL_SOURCE_TITLES)})
    GROUP BY sd.title
  `
  const byTitle = new Map(rows.map((row) => [row.title, row]))
  const missingRequiredSources = REQUIRED_LEGAL_SOURCE_TITLES.filter((title) => {
    const row = byTitle.get(title)
    return !row || Number(row.chunk_count) === 0 || Number(row.embedded_count) === 0
  })
  return { missingRequiredSources }
}

async function retrieveLegalContext(params: {
  tradeFlow: string
  documents: ExtractionData[]
  ruleResults: RuleResultForExpertReview[]
}): Promise<LegalContextChunk[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fallbackLegalChunks()

  const openai = new OpenAI({ apiKey })
  const query = buildLegalContextQuery(params)
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query.slice(0, 8000),
    dimensions: 1536,
  })
  const vector = `[${embedding.data[0]!.embedding.join(',')}]`

  const rows = await prisma.$queryRaw<Array<{
    id: string
    chunk_text: string
    article_label: string | null
    source_url: string | null
    title: string
    source_type: string
    jurisdiction: string
    verified_at: Date | null
    similarity: number
  }>>`
    SELECT
      rc.id,
      rc.chunk_text,
      rc.article_label,
      rc.source_url,
      sd.title,
      sd.source_type,
      sd.jurisdiction,
      COALESCE(rc.verified_at, sd.last_verified_at, sd.snapshot_fetched_at) AS verified_at,
      1 - (rc.embedding <=> ${vector}::vector) AS similarity
    FROM regulation_chunks rc
    JOIN source_documents sd ON sd.id = rc.source_document_id
    WHERE rc.embedding IS NOT NULL
      AND 1 - (rc.embedding <=> ${vector}::vector) >= 0.3
    ORDER BY rc.embedding <=> ${vector}::vector
    LIMIT 14
  `

  if (rows.length === 0) return fallbackLegalChunks()

  return rows.map((row) => ({
    id: row.id,
    chunkText: row.chunk_text,
    articleLabel: row.article_label,
    sourceUrl: row.source_url,
    sourceTitle: row.title,
    sourceType: row.source_type,
    jurisdiction: row.jurisdiction,
    verifiedAt: row.verified_at,
    similarity: Number(row.similarity),
  }))
}

async function fallbackLegalChunks(): Promise<LegalContextChunk[]> {
  const rows = await prisma.regulationChunk.findMany({
    where: {
      sourceDocument: { title: { in: REQUIRED_LEGAL_SOURCE_TITLES } },
    },
    include: { sourceDocument: true },
    orderBy: [{ sourceDocumentId: 'asc' }, { chunkIndex: 'asc' }],
    take: 14,
  })

  return rows.map((row) => ({
    id: row.id,
    chunkText: row.chunkText,
    articleLabel: row.articleLabel,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceDocument.title,
    sourceType: row.sourceDocument.sourceType,
    jurisdiction: row.sourceDocument.jurisdiction,
    verifiedAt: row.verifiedAt ?? row.sourceDocument.lastVerifiedAt ?? row.sourceDocument.snapshotFetchedAt,
  }))
}

async function requestParsedExpertReview(params: {
  openai: OpenAI
  model: string
  params: {
    tradeFlow: string
    documents: ExtractionData[]
    ruleResults: RuleResultForExpertReview[]
  }
  contextChunks: LegalContextChunk[]
  maxFindings: number
  contextLimit: number
  payloadLimit: number
}): Promise<ParsedExpertReviewResponse> {
  try {
    return await requestParsedExpertReviewOnce(params)
  } catch (primaryError) {
    logger.warn('AI expert review structured response failed; retrying with compact prompt', {
      error: formatError(primaryError),
    })

    try {
      return await requestParsedExpertReviewOnce({
        ...params,
        maxFindings: Math.min(RETRY_MAX_FINDINGS, params.maxFindings),
        contextLimit: RETRY_CONTEXT_CHUNK_LIMIT,
        payloadLimit: RETRY_PROMPT_PAYLOAD_CHARS,
      })
    } catch (retryError) {
      throw new Error(
        [
          'OpenAI expert review structured response failed twice.',
          `primary=${formatError(primaryError)}`,
          `retry=${formatError(retryError)}`,
        ].join(' '),
      )
    }
  }
}

async function requestParsedExpertReviewOnce(params: {
  openai: OpenAI
  model: string
  params: {
    tradeFlow: string
    documents: ExtractionData[]
    ruleResults: RuleResultForExpertReview[]
  }
  contextChunks: LegalContextChunk[]
  maxFindings: number
  contextLimit: number
  payloadLimit: number
}): Promise<ParsedExpertReviewResponse> {
  const schema = makeExpertReviewSchema(params.maxFindings)
  const contextChunks = params.contextChunks.slice(0, params.contextLimit)
  const response = await params.openai.responses.parse(
    {
      model: params.model,
      reasoning: { effort: getReasoningEffort() },
      input: [
        {
          role: 'system',
          content:
            'Sen Türkiye gümrük işlemleri için çalışan uzman inceleme asistanısın. Çıktı tamamen Türkçe, kısa, şema uyumlu JSON ve sadece verilen belge kanıtları ile mevzuat parçalarına dayalı olmalıdır.',
        },
        {
          role: 'user',
          content: buildExpertReviewPrompt(params.params, contextChunks, {
            maxFindings: params.maxFindings,
            payloadLimit: params.payloadLimit,
          }),
        },
      ],
      text: {
        format: zodTextFormat(schema, 'gumrukyz_expert_review'),
      },
      max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
    },
    {
      timeout: getTimeoutMs(),
      maxRetries: 1,
    },
  )

  const parsed = response.output_parsed as ExpertReviewResponse | null
  if (!parsed) throw new Error('OpenAI expert review returned no parsed output')

  return {
    parsed,
    responseModel: String(response.model ?? params.model),
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    contextChunks,
  }
}

function makeExpertReviewSchema(maxFindings: number) {
  return z.object({
    overall_risk: OverallRiskSchema,
    summary: z.string().min(1).max(900),
    findings: z.array(ExpertFindingSchema).max(maxFindings),
  })
}

function buildExpertReviewPrompt(
  params: {
    tradeFlow: string
    documents: ExtractionData[]
    ruleResults: RuleResultForExpertReview[]
  },
  chunks: LegalContextChunk[],
  options: { maxFindings: number; payloadLimit: number },
): string {
  const payload = {
    tradeFlow: params.tradeFlow,
    documents: params.documents.map((document) => ({
      docType: document.docType,
      confidence: document.confidence,
      data: compactJson(document.data),
    })),
    deterministicRuleResults: params.ruleResults
      .filter((result) => result.result !== 'PASS' && result.result !== 'SKIP')
      .map((result) => ({
        ruleCode: result.ruleCode,
        result: result.result,
        severity: result.severity,
        message: result.message,
        sourceRefs: result.sourceRefsJson,
      })),
    legalContext: chunks.map((chunk) => ({
      chunkId: chunk.id,
      sourceTitle: chunk.sourceTitle,
      articleLabel: chunk.articleLabel,
      url: chunk.sourceUrl,
      excerpt: chunk.chunkText.slice(0, LEGAL_CONTEXT_EXCERPT_CHARS),
    })),
  }

  return `Aşağıdaki gümrük dosyasını yorum gerektiren uzman riskleri açısından incele.

İnceleme alanları:
- GTİP kodunun eşya tanımı, kullanım amacı, materyal ve belge verileriyle makul olup olmadığı
- GTİP/ürün bağlamında izin, uygunluk, ürün güvenliği veya sektörel kontrol ihtimali
- İthalat/ihracat yönü ve rejim kodunun belge içeriğiyle uyumu
- Kıymet, bedelsiz işlem, tutar/ağırlık/ambalaj tutarlılığı ve olağan dışı değer riski
- Menşe, tercihli rejim, A.TR/EUR.1/menşe belgesi ihtiyacı
- Incoterms ve taşıma sorumluluğu kaynaklı operasyon riski
- Belgeler arası yorum gerektiren tutarsızlıklar

Kesin kurallar:
- Deterministik kuralların yerine geçme; sadece ek uzman yorumu üret.
- Bulgular yalnızca WARN veya REVIEW_NEEDED olabilir; FAIL üretme.
- Tüm açıklama ve önerileri Türkçe yaz.
- Sadece legalContext içinde verilen chunkId değerlerine atıf yap. Yeni kanun, madde, URL veya kaynak uydurma.
- GTİP veya ürün mevzuatı için yeterli bağlam yoksa açıkça "manuel uzman incelemesi gerekir" de.
- Kanıtı olmayan bulgu üretme.
- En fazla ${options.maxFindings} bulgu üret.
- Her bulguda en fazla 3 mevzuat atfı kullan.
- Başlık en fazla 12 kelime, açıklama en fazla 3 kısa cümle, öneri en fazla 2 kısa cümle olsun.

İncelenecek veri:
${JSON.stringify(payload).slice(0, options.payloadLimit)}`
}

function buildLegalContextQuery(params: {
  tradeFlow: string
  documents: ExtractionData[]
  ruleResults: RuleResultForExpertReview[]
}): string {
  return [
    `Akış: ${params.tradeFlow}`,
    params.documents
      .map((document) => `${document.docType}: ${JSON.stringify(compactJson(document.data)).slice(0, 1000)}`)
      .join('\n'),
    params.ruleResults
      .filter((result) => result.result !== 'PASS' && result.result !== 'SKIP')
      .map((result) => `${result.ruleCode}: ${result.message}`)
      .join('\n'),
  ].join('\n')
}

async function persistExpertReview(params: {
  reviewId: string
  tenantId: string
  legalContextStatus: string
  overallRisk: string
  summary: string
  findings: Array<z.infer<typeof ExpertFindingSchema>>
  allowedChunks: LegalContextChunk[]
}): Promise<ExpertReviewSummary> {
  const allowedChunkIds = new Set(params.allowedChunks.map((chunk) => chunk.id))
  const savedFindings: ExpertReviewSummary['findings'] = []
  let warningCount = 0
  let reviewNeededCount = 0

  await prisma.$transaction(async (tx) => {
    await tx.expertReview.update({
      where: { id: params.reviewId },
      data: {
        status: 'COMPLETED',
        legalContextStatus: params.legalContextStatus,
        overallRisk: params.overallRisk,
        summary: params.summary,
        completedAt: new Date(),
      },
    })

    for (const finding of params.findings) {
      const severity = finding.severity === 'WARN' ? 'WARN' : 'REVIEW_NEEDED'
      if (severity === 'WARN') warningCount += 1
      if (severity === 'REVIEW_NEEDED') reviewNeededCount += 1

      const created = await tx.expertReviewFinding.create({
        data: {
          expertReviewId: params.reviewId,
          tenantId: params.tenantId,
          area: finding.area,
          severity,
          confidence: normalizeConfidence(finding.confidence),
          title: finding.title,
          explanation: finding.explanation,
          recommendation: finding.recommendation,
          evidenceRefsJson: finding.evidence_refs as Prisma.InputJsonValue,
        },
      })

      const citationChunkIds = [...new Set(finding.citation_chunk_ids)]
        .filter((chunkId) => allowedChunkIds.has(chunkId))
      if (citationChunkIds.length > 0) {
        await tx.expertReviewFindingCitation.createMany({
          data: citationChunkIds.map((regulationChunkId) => ({
            findingId: created.id,
            regulationChunkId,
          })),
          skipDuplicates: true,
        })
      }

      savedFindings.push({
        area: finding.area,
        severity,
        title: finding.title,
        explanation: finding.explanation,
      })
    }
  })

  return {
    id: params.reviewId,
    status: 'COMPLETED',
    legalContextStatus: params.legalContextStatus,
    overallRisk: params.overallRisk,
    summary: params.summary,
    warningCount,
    reviewNeededCount,
    findings: savedFindings,
  }
}

function compactJson(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === 'string' && nestedValue.length > 500) return `${nestedValue.slice(0, 500)}...`
    return nestedValue
  }))
}

function normalizeConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100))
}

function getMaxFindings(): number {
  const configured = Number(process.env.OPENAI_EXPERT_REVIEW_MAX_FINDINGS ?? DEFAULT_MAX_FINDINGS)
  return Number.isFinite(configured) ? Math.max(1, Math.min(20, Math.round(configured))) : DEFAULT_MAX_FINDINGS
}

function getTimeoutMs(): number {
  const configured = Number(process.env.OPENAI_EXPERT_REVIEW_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  return Number.isFinite(configured) ? configured : DEFAULT_TIMEOUT_MS
}

function getReasoningEffort(): 'none' | 'low' | 'medium' | 'high' | 'xhigh' {
  const configured = process.env.OPENAI_EXPERT_REVIEW_REASONING_EFFORT?.trim().toLowerCase()
  if (configured === 'none' || configured === 'low' || configured === 'high' || configured === 'xhigh') {
    return configured
  }
  return DEFAULT_REASONING_EFFORT
}

function estimateCost(model: string, inputTokens?: number, outputTokens?: number): number | undefined {
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return undefined

  const normalized = model.toLowerCase()
  const rates = normalized.includes('gpt-5.5')
    ? { input: 5, output: 30 }
    : normalized.includes('gpt-5.4-mini')
      ? { input: 0.75, output: 4.5 }
      : { input: 2.5, output: 15 }

  return Math.round(((inputTokens * rates.input + outputTokens * rates.output) / 1_000_000) * 1_000_000) / 1_000_000
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
