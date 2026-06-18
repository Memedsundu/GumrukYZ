import { createHash } from 'node:crypto'
import { prisma, Prisma } from '@gumrukyz/db'
import { logger } from '@gumrukyz/shared'
import { extractTextFromPdf } from './pdf-extractor'
import {
  isAzureDocumentIntelligenceEnabled,
  runAzureLayoutExtraction,
} from './azure-document-intelligence'
import { azureProviderUsageFields } from './provider-usage'

type DocumentVersionForRead = {
  id: string
  fileUrl: string
  originalFilename: string
  mimeType: string
}

export type CanonicalDocumentRead = {
  id: string | null
  text: string
  confidence: number
  method: string
  providerRunId: string | null
  pageCount: number | null
  tableCount: number | null
  pdfImageCount?: number
  pdfPagesWithImages?: number
  likelyRasterScan?: boolean
}

export type ReadDocumentTextParams = {
  tenantId: string
  submissionId?: string | null
  documentId: string
  documentVersion: DocumentVersionForRead
  operation: string
  preferAzure?: boolean
  allowNativeFallback?: boolean
  minimumConfidence?: number
  minimumTextLength?: number
}

export async function findReusableDocumentRead(params: {
  tenantId: string
  documentVersionId: string
  preferAzure?: boolean
  minimumTextLength?: number
}): Promise<CanonicalDocumentRead | null> {
  const reads = await prisma.documentRead.findMany({
    where: {
      tenantId: params.tenantId,
      documentVersionId: params.documentVersionId,
      status: 'OK',
      rawText: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  const minLength = params.minimumTextLength ?? 1
  const canonicalReads = reads.map((read) => toCanonicalRead(read))
  if (params.preferAzure) {
    const azure = canonicalReads.find((read) => read.method === 'AZURE_DOC_INTEL')
    if (azure) return azure
  }
  const usable = canonicalReads.filter((read) => read.text.trim().length >= minLength)
  if (usable.length === 0) return null
  return usable[0] ?? null
}

export async function readDocumentText(params: ReadDocumentTextParams): Promise<CanonicalDocumentRead> {
  const preferAzure = params.preferAzure ?? true
  const allowNativeFallback = params.allowNativeFallback ?? true
  const reusable = await findReusableDocumentRead({
    tenantId: params.tenantId,
    documentVersionId: params.documentVersion.id,
    preferAzure,
    minimumTextLength: params.minimumTextLength,
  })
  if (reusable && (!preferAzure || reusable.method === 'AZURE_DOC_INTEL' || !isAzureDocumentIntelligenceEnabled())) {
    if (
      reusable.method === 'AZURE_DOC_INTEL' &&
      allowNativeFallback &&
      !isUsableRead(reusable, params.minimumConfidence ?? 0, params.minimumTextLength ?? 1)
    ) {
      const nativeRead = await readWithNative(params)
      return chooseBestRead(reusable, nativeRead)
    }
    return reusable
  }

  if (preferAzure && isAzureDocumentIntelligenceEnabled()) {
    let azureRead: CanonicalDocumentRead | null = null
    try {
      azureRead = await readWithAzure(params)
    } catch (error) {
      if (!allowNativeFallback) throw error
      logger.warn('Azure document read failed, falling back to native PDF text', {
        documentId: params.documentId,
        documentVersionId: params.documentVersion.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return readWithNative(params)
    }

    if (
      isUsableRead(azureRead, params.minimumConfidence ?? 0, params.minimumTextLength ?? 1) ||
      !allowNativeFallback
    ) {
      return azureRead
    }

    logger.warn('Azure document read was weak, trying native PDF text', {
      documentId: params.documentId,
      documentVersionId: params.documentVersion.id,
      confidence: azureRead.confidence,
      textLength: azureRead.text.trim().length,
    })
    const nativeRead = await readWithNative(params)
    return chooseBestRead(azureRead, nativeRead)
  }

  return readWithNative(params)
}

async function readWithAzure(params: ReadDocumentTextParams): Promise<CanonicalDocumentRead> {
  const startedAt = Date.now()
  const providerRun = await prisma.providerRun.create({
    data: {
      tenantId: params.tenantId,
      submissionId: params.submissionId ?? null,
      documentId: params.documentId,
      documentVersionId: params.documentVersion.id,
      provider: 'azure_doc_intel',
      model: process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID ?? 'prebuilt-layout',
      operation: params.operation,
      status: 'OK',
    },
  })

  try {
    const result = await runAzureLayoutExtraction(
      params.documentVersion.fileUrl,
      params.documentVersion.originalFilename,
      params.documentVersion.mimeType,
    )
    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        ...azureProviderUsageFields(result),
        durationMs: Date.now() - startedAt,
      },
    })

    return persistDocumentRead({
      tenantId: params.tenantId,
      documentId: params.documentId,
      documentVersionId: params.documentVersion.id,
      providerRunId: providerRun.id,
      method: result.method,
      text: result.text,
      confidence: result.confidence,
      pageCount: result.pageCount,
      tableCount: result.tableCount,
      markdownText: result.text,
      status: 'OK',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Azure Document Intelligence read failed'
    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        status: 'ERROR',
        errorMessage: message,
        durationMs: Date.now() - startedAt,
      },
    })
    await persistDocumentRead({
      tenantId: params.tenantId,
      documentId: params.documentId,
      documentVersionId: params.documentVersion.id,
      providerRunId: providerRun.id,
      method: 'AZURE_DOC_INTEL',
      text: '',
      confidence: 0,
      pageCount: null,
      tableCount: null,
      status: 'ERROR',
      errorMessage: message,
    })
    throw error
  }
}

async function readWithNative(params: ReadDocumentTextParams): Promise<CanonicalDocumentRead> {
  const result = await extractTextFromPdf(
    params.documentVersion.fileUrl,
    params.documentVersion.originalFilename,
    params.documentVersion.mimeType,
  )

  return persistDocumentRead({
    tenantId: params.tenantId,
    documentId: params.documentId,
    documentVersionId: params.documentVersion.id,
    providerRunId: null,
    method: result.method,
    text: result.text,
    confidence: result.confidence,
    pageCount: null,
    tableCount: null,
    status: 'OK',
    pdfImageCount: result.imageCount,
    pdfPagesWithImages: result.pagesWithImages,
    likelyRasterScan: result.likelyRasterScan,
  })
}

type PersistReadParams = {
  tenantId: string
  documentId: string
  documentVersionId: string
  providerRunId: string | null
  method: string
  text: string
  confidence: number
  pageCount: number | null
  tableCount: number | null
  markdownText?: string | null
  status: string
  errorMessage?: string | null
  pdfImageCount?: number
  pdfPagesWithImages?: number
  likelyRasterScan?: boolean
}

async function persistDocumentRead(params: PersistReadParams): Promise<CanonicalDocumentRead> {
  const contentHash = params.text ? createHash('sha256').update(params.text).digest('hex') : null
  const tablesJson = params.tableCount != null
    ? ({ tableCount: params.tableCount } as Prisma.InputJsonValue)
    : Prisma.JsonNull
  const record = await prisma.documentRead.upsert({
    where: {
      documentVersionId_method: {
        documentVersionId: params.documentVersionId,
        method: params.method,
      },
    },
    create: {
      tenantId: params.tenantId,
      documentId: params.documentId,
      documentVersionId: params.documentVersionId,
      providerRunId: params.providerRunId,
      method: params.method,
      rawText: params.text,
      markdownText: params.markdownText ?? null,
      tablesJson,
      pageCount: params.pageCount,
      confidence: params.confidence,
      contentHash,
      status: params.status,
      errorMessage: params.errorMessage ?? null,
    },
    update: {
      providerRunId: params.providerRunId,
      rawText: params.text,
      markdownText: params.markdownText ?? null,
      tablesJson,
      pageCount: params.pageCount,
      confidence: params.confidence,
      contentHash,
      status: params.status,
      errorMessage: params.errorMessage ?? null,
    },
  })
  const read = toCanonicalRead(record)
  return {
    ...read,
    pdfImageCount: params.pdfImageCount,
    pdfPagesWithImages: params.pdfPagesWithImages,
    likelyRasterScan: params.likelyRasterScan,
  }
}

function toCanonicalRead(read: {
  id: string
  rawText: string | null
  confidence: number | null
  method: string
  providerRunId: string | null
  pageCount: number | null
  tablesJson: Prisma.JsonValue | null
}): CanonicalDocumentRead {
  return {
    id: read.id,
    text: read.rawText ?? '',
    confidence: read.confidence ?? 0,
    method: read.method,
    providerRunId: read.providerRunId,
    pageCount: read.pageCount ?? null,
    tableCount: extractTableCount(read.tablesJson),
  }
}

function extractTableCount(value: Prisma.JsonValue | null): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const count = (value as Record<string, unknown>)['tableCount']
  return typeof count === 'number' && Number.isFinite(count) ? count : null
}

function isUsableRead(read: CanonicalDocumentRead, minimumConfidence: number, minimumTextLength: number): boolean {
  return read.confidence >= minimumConfidence && read.text.trim().length >= minimumTextLength
}

function chooseBestRead(primary: CanonicalDocumentRead, fallback: CanonicalDocumentRead): CanonicalDocumentRead {
  const primaryUsefulChars = primary.text.trim().length
  const fallbackUsefulChars = fallback.text.trim().length
  if (fallback.confidence > primary.confidence && fallbackUsefulChars > primaryUsefulChars * 1.2) return fallback
  if (fallbackUsefulChars >= primaryUsefulChars + 300) return fallback
  return primary
}
