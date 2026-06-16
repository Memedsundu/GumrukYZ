import { z } from 'zod'
import {
  parseStructuredOutput,
  DeclarationOutputExtractionSchema,
  InvoiceExtractionSchema,
  LoadingInstructionExtractionSchema,
  OriginDocExtractionSchema,
  PackingListExtractionSchema,
  TransportDocExtractionSchema,
} from '@gumrukyz/ai'
import type { DocumentType, TradeFlow } from '@gumrukyz/domain'
import { estimateModelCostUsd } from '@gumrukyz/shared'
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

  const { parsed, responseModel, inputTokens, outputTokens } = await parseStructuredOutput<z.infer<typeof responseSchema>>({
    model,
    schema: responseSchema,
    schemaName: `${params.docType.toLowerCase()}_document_reader`,
    system:
      'You extract customs document data for Turkish customs compliance workflows. Return only facts clearly visible in the uploaded file.',
    user: [
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
    maxOutputTokens: 6_000,
    timeoutMs: getTimeoutMs(),
    maxRetries: 1,
  })

  return {
    structuredData: parsed.structured_data as Record<string, unknown>,
    extractedText: parsed.extracted_text,
    confidence: normalizeConfidence(parsed.confidence),
    model: responseModel,
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
- For customs declarations (beyanname), read each kalem (line item) row into items[] with its own GTİP code, goods description, quantity, weights and value. Leave items null only when no line-item table is visible.
- Parse locale number formats carefully: "980.00" and "980,00" mean 980; "1,185.00" and "1.185,00" mean 1185. Do not drop decimal separators in a way that turns 980.00 into 98000.
- For packing-list item rows, separate package_count from product quantity. If a row says "4 boxes" and "Quantity Inside 53 pcs", set item.package_count=4 and item.quantity=53.
- For packing lists, pieces/adet, boxes/sandık, and pallets/palet are different unit categories. "480 pcs/adet in 12 wooden boxes on 3 pallets" means item quantity 480 and package_count 12; do not set package_count to 480, 3, or 15. If a table explicitly lists pallets as package rows and has Total/TOPLAM packages, use that explicit total and preserve package_breakdown.
- Do not infer net_weight from quantity, package count, or gross_weight. Use net_weight only when a visible label says Net Weight, Net Kg, Net Ağırlık, or Toplam Net.
- For packing lists with only Brüt Ağırlık/Gross Weight columns, return net_weight as null at both document and item level.
- For loading instructions too, package_count is the declared box/package count. Do not add handling pallets in slash/on-pallet phrasing: "8 wooden boxes / 2 pallets" means package_count=8, not 10. If separate package lines say "6 pcs wooden box" and "3 pcs pallet", preserve package_breakdown and use package_count=9.
- For loading instructions with only Brüt kg/Gross Weight, return net_weight as null.
- For invoices, return country_of_origin only when an origin/menşe field is visible; do not copy seller country or address country into country_of_origin.
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
  return estimateModelCostUsd(model, inputTokens, outputTokens)
}
