import { generateObject, generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import type { LlmProvider, DocumentClassificationResult, ExplanationResult, ProviderRunMetadata } from './provider.js'
import type { DocumentType } from '@gumrukyz/domain'
import { DocumentType as DocTypeEnum } from '@gumrukyz/domain'
import { ProviderError } from '@gumrukyz/shared'

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
})

const RiskSummarySchema = z.object({
  summary: z.string(),
  findingExplanations: z.array(
    z.object({
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

Filename: ${filename}

Document text (first 3000 characters):
${rawText.slice(0, 3000)}

Return the detected document type, your confidence (0-1), and brief reasoning.`,
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

  async generateRiskSummary(
    findings: Array<{ ruleCode: string; severity: string; message: string }>,
    tradeFlow: string,
  ): Promise<{ result: ExplanationResult; meta: ProviderRunMetadata }> {
    const client = this.getClient()
    const start = Date.now()

    const findingsList = findings
      .map((f) => `[${f.severity}] ${f.ruleCode}: ${f.message}`)
      .join('\n')

    const { object, usage } = await generateObject({
      model: client(this.model),
      schema: RiskSummarySchema,
      prompt: `You are a customs compliance assistant. Generate a plain-language risk report summary.

Trade flow: ${tradeFlow}
Findings:
${findingsList}

Rules:
- Write in clear, non-technical language for a customs broker
- Do not make legal determinations or guarantee customs clearance
- Explain what each finding means in practice
- Keep the overall summary to 2-3 sentences`,
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
    // gpt-4o pricing: $2.50/1M input, $10.00/1M output (approximate)
    return (inputTokens * 0.0000025) + (outputTokens * 0.00001)
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
