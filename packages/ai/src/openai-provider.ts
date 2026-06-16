import { generateObject, generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import type { LlmProvider, DocumentClassificationResult, ExplanationResult, ProviderRunMetadata, RiskSummaryCoverageContext, RiskSummaryFindingInput } from './provider.js'
import type { DocumentType } from '@gumrukyz/domain'
import { DocumentType as DocTypeEnum, TradeFlow } from '@gumrukyz/domain'
import { ProviderError, estimateModelCostUsd } from '@gumrukyz/shared'

const DocumentClassificationSchema = z.object({
  detectedType: z.enum([
    DocTypeEnum.INVOICE,
    DocTypeEnum.PACKING_LIST,
    DocTypeEnum.LOADING_INSTRUCTION,
    DocTypeEnum.TRANSPORT_DOC,
    DocTypeEnum.DECLARATION_OUTPUT,
    DocTypeEnum.ORIGIN_DOC,
    DocTypeEnum.PERMIT_DOC,
    DocTypeEnum.OTHER,
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  detectedTradeFlow: z.enum([TradeFlow.UNKNOWN, TradeFlow.IMPORT, TradeFlow.EXPORT]),
  tradeFlowConfidence: z.number().min(0).max(1),
  sourceRefs: z.array(
    z.object({
      field: z.string(),
      value: z.string(),
    }),
  ),
  parties: z.array(
    z.object({
      role: z.string(),
      name: z.string().nullable(),
      taxId: z.string().nullable(),
      address: z.string().nullable(),
      country: z.string().nullable(),
    }),
  ),
})

/**
 * Bump when the risk summary prompt or schema changes; stored on the
 * risk_summary ProviderRun row so findings can be tied to a prompt revision.
 */
export const RISK_SUMMARY_PROMPT_VERSION = '2026-06-15.1'

const RiskSummarySchema = z.object({
  summary: z.string(),
  findingExplanations: z.array(
    z.object({
      findingId: z.string(),
      ruleCode: z.string(),
      explanation: z.string(),
    }),
  ),
})

export class OpenAIProvider implements LlmProvider {
  private readonly model: string

  constructor() {
    this.model = process.env['OPENAI_MODEL'] ?? 'gpt-4o'
  }

  isEnabled(): boolean {
    return Boolean(process.env['OPENAI_API_KEY'])
  }

  private getClient() {
    const apiKey = process.env['OPENAI_API_KEY']
    if (!apiKey) throw new ProviderError('openai', 'OPENAI_API_KEY is not set')
    return createOpenAI({ apiKey })
  }

  async classifyDocument(
    rawText: string,
    filename: string,
  ): Promise<{ result: DocumentClassificationResult; meta: ProviderRunMetadata }> {
    const client = this.getClient()
    const start = Date.now()

    const { object, usage } = await generateObject({
      model: client(this.model),
      schema: DocumentClassificationSchema,
      prompt: `You are a customs document classification system.
Classify the following document into one of these types:
INVOICE, PACKING_LIST, LOADING_INSTRUCTION, TRANSPORT_DOC, DECLARATION_OUTPUT, ORIGIN_DOC, PERMIT_DOC, OTHER

Also infer whether the package appears to be IMPORT, EXPORT, or UNKNOWN from directional evidence:
- export/exporter/ihracatçı, loading from Turkey, Turkish seller to foreign buyer => EXPORT
- import/importer/ithalatçı, foreign seller to Turkish buyer, arrival into Turkey => IMPORT
- if evidence is weak, use UNKNOWN.

Extract visible business parties for client matching: importer, exporter, buyer, seller, consignee, shipper. Preserve tax IDs, names, addresses, and countries when visible.

Filename: ${filename}

Document text (first 3000 characters):
${rawText.slice(0, 3000)}

Return detected document type, document confidence, detected trade flow, trade-flow confidence, sourceRefs used for classification, parties, and brief reasoning.`,
    })

    return {
      result: object,
      meta: {
        provider: 'openai',
        model: this.model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        estimatedCostUsd: this.estimateCost(usage.promptTokens, usage.completionTokens),
        durationMs: Date.now() - start,
      },
    }
  }

  async extractStructured<T>(
    rawText: string,
    schema: z.ZodType<T>,
    schemaName: string,
    docType: DocumentType,
  ): Promise<{ result: T; meta: ProviderRunMetadata }> {
    const client = this.getClient()
    const start = Date.now()

    const { object, usage } = await generateObject({
      model: client(this.model),
      schema,
      prompt: `You are a customs document data extraction system.
Extract structured data from the following ${docType} document.
Schema name: ${schemaName}

Return only what is clearly present in the document. Use null for missing fields.

Document text:
${rawText.slice(0, 6000)}`,
    })

    return {
      result: object,
      meta: {
        provider: 'openai',
        model: this.model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        estimatedCostUsd: this.estimateCost(usage.promptTokens, usage.completionTokens),
        durationMs: Date.now() - start,
      },
    }
  }

  async embedText(text: string): Promise<number[]> {
    const apiKey = process.env['OPENAI_API_KEY']
    if (!apiKey) throw new ProviderError('openai', 'OPENAI_API_KEY is not set')
    const openai = createOpenAI({ apiKey })
    const { embeddings } = await openai.embedding('text-embedding-3-small').doEmbed({
      values: [text.slice(0, 8000)],
    })
    return Array.from(embeddings[0]!)
  }

  async generateRiskSummary(
    findings: RiskSummaryFindingInput[],
    tradeFlow: string,
    regulationContext?: Array<{ title: string; excerpt: string }>,
    documentCoverage?: RiskSummaryCoverageContext,
  ): Promise<{ result: ExplanationResult; meta: ProviderRunMetadata }> {
    const client = this.getClient()
    const start = Date.now()

    const findingsList = findings
      .map((f) => `[findingId=${f.findingId}] [${f.severity}] ${f.ruleCode}: ${f.message}`)
      .join('\n')

    const regulationSection = regulationContext && regulationContext.length > 0
      ? `\nİlgili mevzuat bağlamı:\n${regulationContext.map((r) => `• ${r.title}: "${r.excerpt}"`).join('\n')}`
      : ''

    const coverageSection = documentCoverage
      ? `\nBelge kapsamı:
- Mevcut belgeler: ${documentCoverage.presentLabels.join(', ') || '—'}
- Eksik beklenen belgeler: ${documentCoverage.missingExpectedLabels.join(', ') || '—'}
- Koşullu eksik belgeler: ${documentCoverage.missingConditionalLabels.join(', ') || '—'}
- Sınırlama: ${documentCoverage.limitationNotice}`
      : ''

    const { object, usage } = await generateObject({
      model: client(this.model),
      schema: RiskSummarySchema,
      prompt: `Sen Türkiye'deki gümrük operasyon ekipleri ve gümrük müşavirleri için çalışan bir uygunluk asistanısın. Risk raporu özetini Türkçe üret.

Ticaret akışı: ${tradeFlow}
Bulgular:
${findingsList}${regulationSection}${coverageSection}

Kurallar:
- Tüm alanları Türkçe yaz
- Kısa, açık ve operasyon kullanıcısının anlayacağı bir dil kullan
- Hukuki hüküm verme ve gümrük işleminin kesin geçeceğini söyleme
- Bulguların pratikte ne anlama geldiğini açıkla
- Mevzuat bağlamı verilmişse ilgili maddelere Türkçe atıf yap; kaynak uydurmama
- Eksik beklenen belgeler varsa özette açıkça belirt ve sonuçların mevcut belgelerle sınırlı olduğunu vurgula; eksik belge olmadığında fazla temkinli olma
- Genel özeti 2-3 cümleyle sınırla
- findingExplanations içinde her bulgunun findingId değerini AYNEN kopyala; yeni findingId uydurma`,
    })

    return {
      result: object,
      meta: {
        provider: 'openai',
        model: this.model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        estimatedCostUsd: this.estimateCost(usage.promptTokens, usage.completionTokens),
        durationMs: Date.now() - start,
      },
    }
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    return estimateModelCostUsd(this.model, inputTokens, outputTokens) ?? 0
  }

  async generateText(prompt: string): Promise<{ text: string; meta: ProviderRunMetadata }> {
    const client = this.getClient()
    const start = Date.now()
    const { text, usage } = await generateText({
      model: client(this.model),
      prompt,
    })
    return {
      text,
      meta: {
        provider: 'openai',
        model: this.model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        durationMs: Date.now() - start,
      },
    }
  }
}
