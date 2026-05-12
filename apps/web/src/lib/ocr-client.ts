import { inferDocumentContentType, isPdfDocument } from './document-file-types'
import { readFileArrayBuffer } from './pdf-extractor'

export type OcrServiceResult = {
  text: string
  confidence: number
  pageCount: number
  method: 'OCR_PYTHON'
}

type OcrServiceResponse = {
  text?: unknown
  confidence?: unknown
  page_count?: unknown
  method?: unknown
}

export async function runOcrFallback(
  fileUrl: string,
  filename: string,
  mimeType?: string | null,
): Promise<OcrServiceResult> {
  const serviceUrl = process.env.OCR_SERVICE_URL
  const serviceSecret = process.env.OCR_SERVICE_SECRET
  if (!serviceUrl) {
    throw new Error('OCR_SERVICE_URL is not configured')
  }
  if (!isPdfDocument(filename, mimeType)) {
    throw new Error('OCR service fallback currently supports PDF files only')
  }

  const pdfBytes = await readFileArrayBuffer(fileUrl)
  const contentType = inferDocumentContentType(filename, mimeType)
  const form = new FormData()
  form.append('file', new Blob([pdfBytes], { type: contentType }), filename)

  const controller = new AbortController()
  const timeoutMs = Number(process.env.OCR_SERVICE_TIMEOUT_MS ?? 45_000)
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(new URL('/ocr', serviceUrl), {
      method: 'POST',
      headers: {
        ...(serviceSecret ? { 'X-OCR-Secret': serviceSecret } : {}),
      },
      body: form,
      signal: controller.signal,
    })

    const payload = (await response.json().catch(() => ({}))) as OcrServiceResponse
    if (!response.ok) {
      throw new Error(`OCR service returned ${response.status}: ${JSON.stringify(payload)}`)
    }

    if (
      typeof payload.text !== 'string' ||
      typeof payload.confidence !== 'number' ||
      typeof payload.page_count !== 'number' ||
      payload.method !== 'OCR_PYTHON'
    ) {
      throw new Error('OCR service returned an invalid response')
    }

    return {
      text: payload.text,
      confidence: payload.confidence,
      pageCount: payload.page_count,
      method: 'OCR_PYTHON',
    }
  } finally {
    clearTimeout(timeout)
  }
}
