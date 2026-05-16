import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import {
  DeclarationOutputExtractionSchema,
  InvoiceExtractionSchema,
  LoadingInstructionExtractionSchema,
  OriginDocExtractionSchema,
  PackingListExtractionSchema,
  TransportDocExtractionSchema,
} from '@gumrukyz/ai'
import type { DocumentType, TradeFlow } from '@gumrukyz/domain'
import { inferDocumentContentType } from './document-file-types'
import { readFileArrayBuffer } from './pdf-extractor'

const DEFAULT_MODEL = 'gpt-5.4-mini'
const DEFAULT_TIMEOUT_MS = 90_000

export type OpenAIDocumentReaderResult = {
  structuredData: Record<string, unknown>
  extractedText: string
  confidence: number
  model: string
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number
  method: 'OPENAI_VISION'
}

const BaseReaderSchema = z.object({
  confidence: z.number().min(0).max(1),
  extracted_text: z.string(),
  notes: z.string().nullable(),
})

export function isOpenAIDocumentReaderEnabled(): boolean {
  if (process.env.OPENAI_DOCUMENT_READER_ENABLED === 'false') return false
  return Boolean(process.env.OPENAI_API_KEY)
}

export function shouldRunOpenAIDocumentReader(
  confidence: number,
  text: string,
  options?: { force?: boolean },
): boolean {
  if (!isOpenAIDocumentReaderEnabled()) return false
  const mode = process.env.OPENAI_DOCUMENT_READER_MODE?.trim().toLowerCase() ?? 'fallback'
  if (mode === 'off' || mode === 'disabled') return false
  if (mode === 'always') return true
  if (options?.force) return true
  return confidence < getMinimumConfidence() || text.trim().length < 50
}

export async function runOpenAIDocumentReader(params: {
  fileUrl: string
  filename: string
  mimeType?: string | null
  docType: DocumentType
  tradeFlow: TradeFlow
}): Promise<OpenAIDocumentReaderResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const schema = getExtractionSchema(params.docType)
  if (!schema) throw new Error(`OpenAI document reader does not support ${params.docType}`)

  const responseSchema = BaseReaderSchema.extend({
    structured_data: schema,
  })

  const bytes = await readFileArrayBuffer(params.fileUrl)
  const contentType = inferDocumentContentType(params.filename, params.mimeType)
  const base64 = Buffer.from(bytes).toString('base64')
  const model = process.env.OPENAI_DOCUMENT_READER_MODEL ?? DEFAULT_MODEL

  const openai = new OpenAI({ apiKey })
  const response = await openai.responses.parse(
    {
      model,
      input: [
        {
          role: 'system',
          content:
            'You extract customs document data for Turkish customs compliance workflows. Return only facts clearly visible in the uploaded file.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: params.filename,
              file_data: `data:${contentType};base64,${base64}`,
              detail: 'high',
            },
            {
              type: 'input_text',
              text: buildReaderPrompt(params.docType, params.tradeFlow),
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(responseSchema, `${params.docType.toLowerCase()}_document_reader`),
      },
      max_output_tokens: 6_000,
    },
    {
      timeout: getTimeoutMs(),
      maxRetries: 1,
    },
  )

  const parsed = response.output_parsed as z.infer<typeof responseSchema> | null
  if (!parsed) throw new Error('OpenAI document reader returned no parsed output')

  const inputTokens = response.usage?.input_tokens
  const outputTokens = response.usage?.output_tokens

  return {
    structuredData: parsed.structured_data as Record<string, unknown>,
    extractedText: parsed.extracted_text,
    confidence: normalizeConfidence(parsed.confidence),
    model: String(response.model ?? model),
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
    method: 'OPENAI_VISION',
  }
}

export function getOpenAIDocumentReaderMinimumConfidence(): number {
  return getMinimumConfidence()
}

function buildReaderPrompt(docType: DocumentType, tradeFlow: TradeFlow): string {
  return `Read the uploaded customs document and extract structured data for document type ${docType}.

Trade flow: ${tradeFlow}
Maximum pages to inspect: ${getMaxPages()}

Rules:
- Return null for missing fields.
- Do not invent values that are not visible in the document.
- Preserve document numbers, tax IDs, currency codes, dates, totals, weights, package counts, HS/GTIP codes, and party names exactly where possible.
- For tables, read item rows and totals carefully.
- extracted_text must be a compact Turkish/English evidence summary with the key raw values you used, not a full transcript.
- confidence must reflect document legibility and extraction certainty. Use below 0.65 if key fields are uncertain.`
}

function getExtractionSchema(docType: DocumentType): z.ZodType<unknown> | null {
  switch (docType) {
    case 'INVOICE': return InvoiceExtractionSchema
    case 'PACKING_LIST': return PackingListExtractionSchema
    case 'LOADING_INSTRUCTION': return LoadingInstructionExtractionSchema
    case 'TRANSPORT_DOC': return TransportDocExtractionSchema
    case 'DECLARATION_OUTPUT': return DeclarationOutputExtractionSchema
    case 'ORIGIN_DOC': return OriginDocExtractionSchema
    default: return null
  }
}

function getMinimumConfidence(): number {
  return parseEnvNumber('OPENAI_DOCUMENT_READER_MIN_CONFIDENCE', 0.65)
}

function getTimeoutMs(): number {
  return parseEnvNumber('OPENAI_DOCUMENT_READER_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
}

function getMaxPages(): number {
  return Math.max(1, Math.round(parseEnvNumber('OPENAI_DOCUMENT_READER_MAX_PAGES', 20)))
}

function parseEnvNumber(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}

function normalizeConfidence(confidence: number): number {
  return Math.max(0, Math.min(1, Math.round(confidence * 100) / 100))
}

function estimateCost(model: string, inputTokens?: number, outputTokens?: number): number | undefined {
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return undefined

  const normalizedModel = model.toLowerCase()
  const rates = normalizedModel.includes('gpt-5.4-mini')
    ? { input: 0.75, output: 4.5 }
    : normalizedModel.includes('gpt-5-mini')
      ? { input: 0.25, output: 2 }
      : normalizedModel.includes('gpt-4.1-mini')
        ? { input: 0.4, output: 1.6 }
        : normalizedModel.includes('gpt-4o')
          ? { input: 2.5, output: 10 }
          : { input: 0.75, output: 4.5 }

  return Math.round(((inputTokens * rates.input + outputTokens * rates.output) / 1_000_000) * 1_000_000) / 1_000_000
}
