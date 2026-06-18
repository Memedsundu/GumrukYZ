import { z } from 'zod'
import { parseStructuredOutput } from '@gumrukyz/ai'
import { prisma } from '@gumrukyz/db'
import { estimateModelCostUsd } from '@gumrukyz/shared'
import { openAIProviderUsageFields } from './provider-usage'

const EXTRACTION_CONFIRMATION_PROMPT_VERSION = '2026-06-17.1'

const ConfirmationFindingSchema = z.object({
  doc_type: z.string(),
  field: z.string(),
  current_value: z.string().nullable(),
  suggested_value: z.string().nullable(),
  source_quote: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  action: z.enum(['KEEP', 'SUGGEST_CORRECTION']),
})

const ConfirmationResponseSchema = z.object({
  findings: z.array(ConfirmationFindingSchema),
})

export type ExtractionConfirmationDocument = {
  extractionId: string
  documentId: string
  documentVersionId: string
  docType: string
  filename: string
  rawText: string
  structuredData: Record<string, unknown>
}

export type ExtractionConfirmationFinding = z.infer<typeof ConfirmationFindingSchema>

export type ExtractionConfirmationResult = {
  promptVersion: string
  providerRunId: string | null
  findingsByExtractionId: Map<string, ExtractionConfirmationFinding[]>
  meta: {
    model: string
    inputTokens?: number
    outputTokens?: number
  }
}

export function isExtractionConfirmationEnabled(): boolean {
  const mode = process.env.EXTRACTION_CONFIRMATION_MODE?.trim().toLowerCase()
  if (mode === 'off' || mode === 'disabled' || mode === 'false') return false
  if (mode === 'shadow' || mode === 'on') return true
  if (process.env.EXTRACTION_CONFIRMATION_ENABLED === 'true') return true
  return !mode && process.env.EXTRACTION_CONFIRMATION_ENABLED !== 'false'
}

export async function runExtractionConfirmationShadow(params: {
  tenantId: string
  submissionId: string
  documents: ExtractionConfirmationDocument[]
}): Promise<ExtractionConfirmationResult | null> {
  if (!isExtractionConfirmationEnabled()) return null
  if (!process.env.OPENAI_API_KEY) return null

  const suspectDocs = params.documents.filter(hasSuspectConfirmationField)
  if (suspectDocs.length === 0) return null

  const model = process.env.EXTRACTION_CONFIRMATION_MODEL ?? process.env.OPENAI_DOCUMENT_READER_MODEL ?? 'gpt-5.4-mini'
  const startedAt = Date.now()
  const providerRun = await prisma.providerRun.create({
    data: {
      tenantId: params.tenantId,
      submissionId: params.submissionId,
      provider: 'openai',
      model,
      operation: 'extraction_confirmation_shadow',
      status: 'OK',
      promptVersion: EXTRACTION_CONFIRMATION_PROMPT_VERSION,
    },
  })

  let parsed: z.infer<typeof ConfirmationResponseSchema>
  let responseModel = model
  let inputTokens: number | undefined
  let outputTokens: number | undefined
  try {
    const response = await parseStructuredOutput<z.infer<typeof ConfirmationResponseSchema>>({
      model,
      schema: ConfirmationResponseSchema,
      schemaName: 'extraction_confirmation_shadow',
      system: 'You verify customs extraction fields against source text. Return only source-grounded suggestions; do not invent values.',
      user: [
        {
          type: 'input_text',
          text: buildConfirmationPrompt(suspectDocs),
        },
      ],
      maxOutputTokens: 4_000,
      timeoutMs: 60_000,
      maxRetries: 1,
    })
    parsed = response.parsed
    responseModel = response.responseModel
    inputTokens = response.inputTokens
    outputTokens = response.outputTokens
    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        ...openAIProviderUsageFields({
          model: responseModel,
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimateModelCostUsd(responseModel, inputTokens, outputTokens),
        }),
        durationMs: Date.now() - startedAt,
      },
    })
  } catch (error) {
    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        status: 'ERROR',
        errorMessage: error instanceof Error ? error.message : 'Extraction confirmation failed',
        durationMs: Date.now() - startedAt,
      },
    }).catch(() => {})
    throw error
  }

  const extractionByDocType = new Map(suspectDocs.map((doc) => [doc.docType, doc.extractionId]))
  const findingsByExtractionId = new Map<string, ExtractionConfirmationFinding[]>()
  for (const finding of parsed.findings) {
    if (finding.action !== 'SUGGEST_CORRECTION') continue
    if (finding.confidence < 0.75) continue
    if (!finding.source_quote.trim()) continue
    const extractionId = extractionByDocType.get(finding.doc_type)
    if (!extractionId) continue
    const existing = findingsByExtractionId.get(extractionId) ?? []
    existing.push(finding)
    findingsByExtractionId.set(extractionId, existing)
  }

  if (findingsByExtractionId.size === 0) return null

  return {
    promptVersion: EXTRACTION_CONFIRMATION_PROMPT_VERSION,
    providerRunId: providerRun.id,
    findingsByExtractionId,
    meta: {
      model: responseModel,
      inputTokens,
      outputTokens,
    },
  }
}

function hasSuspectConfirmationField(doc: ExtractionConfirmationDocument): boolean {
  const data = doc.structuredData
  const text = JSON.stringify(data)
  return doc.docType === 'DECLARATION_OUTPUT' ||
    doc.docType === 'PACKING_LIST' ||
    /F\.?\s*O\.?\s*C\.?|Bedelsiz|FREE OF CHARGE|8708,29|invoice_refs|country_of_origin|customs_office_code/i.test(text)
}

function buildConfirmationPrompt(documents: ExtractionConfirmationDocument[]): string {
  return `Check only these suspect extraction fields:
- wrapped GTIP/HS codes;
- commercial invoice references vs TPS/e-fatura technical references;
- F.O.C/Bedelsiz markers and line values;
- origin country vs destination/importer country;
- package totals and package breakdown;
- declaration value labels and customs office code.

Rules:
- This is SHADOW MODE. Do not rewrite the extraction. Return suggestions only.
- Suggest a correction only with an exact source_quote from the text.
- Do not mark every invoice on the same line as F.O.C just because one later invoice says F.O.C.
- Do not treat destination country as country_of_origin. For Turkish export declarations, MEN 052 / TÜRKİYE is origin evidence.
- Do not use TL explanatory values as EUR Bedelsiz line values.
- Keep package rows such as 6 wooden boxes + 3 pallets = 9 KAP when total packages include both rows.

Documents:
${documents.map((doc) => `
[doc_type=${doc.docType}] [extraction_id=${doc.extractionId}] [filename=${doc.filename}]
structured_data=${JSON.stringify(doc.structuredData).slice(0, 3000)}
source_text=${doc.rawText.slice(0, 5000)}
`).join('\n---\n')}`
}
