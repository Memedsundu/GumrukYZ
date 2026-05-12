import { inferDocumentContentType } from './document-file-types'
import { readFileArrayBuffer } from './pdf-extractor'

const DEFAULT_API_VERSION = '2024-11-30'
const DEFAULT_TIMEOUT_MS = 90_000
const DEFAULT_POLL_INTERVAL_MS = 1_000
const DEFAULT_COST_PER_1000_PAGES = 10

export type AzureDocumentIntelligenceResult = {
  text: string
  confidence: number
  pageCount: number
  method: 'AZURE_DOC_INTEL'
  tableCount: number
  estimatedCostUsd: number
  modelId: string
  apiVersion: string
}

type AzureAnalyzeResponse = {
  status?: unknown
  error?: {
    code?: unknown
    message?: unknown
  }
  analyzeResult?: {
    apiVersion?: unknown
    modelId?: unknown
    content?: unknown
    pages?: Array<{
      pageNumber?: unknown
      lines?: Array<{ content?: unknown }>
      words?: Array<{ content?: unknown; confidence?: unknown }>
    }>
    tables?: Array<unknown>
  }
}

export function isAzureDocumentIntelligenceEnabled(): boolean {
  return Boolean(getAzureEndpoint() && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY)
}

export async function runAzureLayoutExtraction(
  fileUrl: string,
  filename: string,
  mimeType?: string | null,
): Promise<AzureDocumentIntelligenceResult> {
  const endpoint = getAzureEndpoint()
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  if (!endpoint || !key) {
    throw new Error('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY are required')
  }

  const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? DEFAULT_API_VERSION
  const modelId = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID ?? 'prebuilt-layout'
  const bytes = await readFileArrayBuffer(fileUrl)
  const contentType = inferDocumentContentType(filename, mimeType)
  const operationLocation = await startAnalyze(endpoint, key, apiVersion, modelId, bytes, contentType)
  const response = await pollAnalyzeResult(operationLocation, key)
  const analyzeResult = response.analyzeResult
  if (!analyzeResult) throw new Error('Azure Document Intelligence returned no analyzeResult')

  const text = buildText(analyzeResult)
  const pageCount = analyzeResult.pages?.length ?? 0
  const confidence = computeAzureConfidence(analyzeResult, text)
  const tableCount = analyzeResult.tables?.length ?? 0
  const costPer1000Pages = Number(
    process.env.AZURE_DOCUMENT_INTELLIGENCE_COST_PER_1000_PAGES ?? DEFAULT_COST_PER_1000_PAGES,
  )

  return {
    text,
    confidence,
    pageCount,
    method: 'AZURE_DOC_INTEL',
    tableCount,
    estimatedCostUsd: roundMoney((Math.max(pageCount, 1) / 1000) * costPer1000Pages),
    modelId: typeof analyzeResult.modelId === 'string' ? analyzeResult.modelId : modelId,
    apiVersion: typeof analyzeResult.apiVersion === 'string' ? analyzeResult.apiVersion : apiVersion,
  }
}

async function startAnalyze(
  endpoint: string,
  key: string,
  apiVersion: string,
  modelId: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const url = new URL(`/documentintelligence/documentModels/${modelId}:analyze`, endpoint)
  url.searchParams.set('api-version', apiVersion)
  url.searchParams.set('outputContentFormat', 'markdown')
  const features = process.env.AZURE_DOCUMENT_INTELLIGENCE_FEATURES ?? 'keyValuePairs'
  if (features.trim()) url.searchParams.set('features', features)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs())

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Ocp-Apim-Subscription-Key': key,
      },
      body: bytes,
      signal: controller.signal,
    })

    const payload = (await response.json().catch(() => null)) as AzureAnalyzeResponse | null
    if (!response.ok) {
      throw new Error(`Azure analyze request failed (${response.status}): ${formatAzureError(payload)}`)
    }

    const operationLocation = response.headers.get('operation-location')
    if (!operationLocation) {
      throw new Error('Azure analyze response did not include operation-location')
    }

    return operationLocation
  } finally {
    clearTimeout(timeout)
  }
}

async function pollAnalyzeResult(operationLocation: string, key: string): Promise<AzureAnalyzeResponse> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < getTimeoutMs()) {
    const response = await fetch(operationLocation, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
      },
    })
    const payload = (await response.json().catch(() => ({}))) as AzureAnalyzeResponse
    if (!response.ok) {
      throw new Error(`Azure analyze polling failed (${response.status}): ${formatAzureError(payload)}`)
    }

    if (payload.status === 'succeeded') return payload
    if (payload.status === 'failed') {
      throw new Error(`Azure analyze operation failed: ${formatAzureError(payload)}`)
    }

    await sleep(getPollIntervalMs())
  }

  throw new Error(`Azure analyze operation timed out after ${getTimeoutMs()}ms`)
}

function buildText(analyzeResult: NonNullable<AzureAnalyzeResponse['analyzeResult']>): string {
  if (typeof analyzeResult.content === 'string' && analyzeResult.content.trim()) {
    return analyzeResult.content.trim()
  }

  return (analyzeResult.pages ?? [])
    .flatMap((page) => page.lines ?? [])
    .map((line) => (typeof line.content === 'string' ? line.content : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function computeAzureConfidence(
  analyzeResult: NonNullable<AzureAnalyzeResponse['analyzeResult']>,
  text: string,
): number {
  const wordConfidences = (analyzeResult.pages ?? [])
    .flatMap((page) => page.words ?? [])
    .map((word) => word.confidence)
    .filter((confidence): confidence is number => typeof confidence === 'number' && Number.isFinite(confidence))

  const lengthScore = Math.min(text.trim().length / 500, 1)
  if (wordConfidences.length === 0) return roundConfidence(lengthScore * 0.8)

  const averageWordConfidence =
    wordConfidences.reduce((total, confidence) => total + confidence, 0) / wordConfidences.length
  return roundConfidence(averageWordConfidence * 0.85 + lengthScore * 0.15)
}

function getAzureEndpoint(): string | null {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim()
  if (!endpoint) return null
  return endpoint.endsWith('/') ? endpoint : `${endpoint}/`
}

function getTimeoutMs(): number {
  return Number(process.env.AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
}

function getPollIntervalMs(): number {
  return Number(process.env.AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS)
}

function formatAzureError(payload: AzureAnalyzeResponse | null): string {
  const message = payload?.error?.message
  if (typeof message === 'string' && message) return message
  return JSON.stringify(payload ?? {})
}

function roundConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100))
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
