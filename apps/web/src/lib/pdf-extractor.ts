/**
 * PDF text extraction using pdfjs-dist (Tier 1 extraction).
 *
 * Confidence scoring:
 * - Based on extracted text length and character quality
 * - < 0.5 = low confidence → triggers OCR fallback or REVIEW_NEEDED flag
 */

import { isPdfDocument } from './document-file-types'

export interface TextExtractionResult {
  text: string
  confidence: number
  pageCount: number
  method: 'TEXT_PDF' | 'EMPTY'
}

export async function extractTextFromPdf(
  fileUrl: string,
  filename = '',
  mimeType?: string | null,
): Promise<TextExtractionResult> {
  if (filename && !isPdfDocument(filename, mimeType)) {
    return {
      text: '',
      confidence: 0,
      pageCount: 0,
      method: 'EMPTY',
    }
  }

  try {
    // Dynamically import the legacy build; the default build expects browser worker setup.
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

    // Disable the web worker — in Node.js/Vercel serverless we use pdfjs's built-in
    // fake worker (synchronous mode). No worker file on disk is required.
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''

    const arrayBuffer = await readFileArrayBuffer(fileUrl)
    const uint8Array = new Uint8Array(arrayBuffer)

    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })

    const pdf = await loadingTask.promise
    const pageCount = pdf.numPages

    let fullText = ''

    for (let pageNum = 1; pageNum <= Math.min(pageCount, 20); pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
      fullText += pageText + '\n'
    }

    const confidence = computeConfidence(fullText)

    return {
      text: fullText.trim(),
      confidence,
      pageCount,
      method: 'TEXT_PDF',
    }
  } catch (err) {
    console.error('PDF extraction error:', err)
    return {
      text: '',
      confidence: 0,
      pageCount: 0,
      method: 'EMPTY',
    }
  }
}

export async function readFileArrayBuffer(fileUrl: string): Promise<ArrayBuffer> {
  if (fileUrl.startsWith('file://')) {
    const { readFile } = await import('fs/promises')
    const buffer = await readFile(new URL(fileUrl))
    const arrayBuffer = new ArrayBuffer(buffer.byteLength)
    new Uint8Array(arrayBuffer).set(buffer)
    return arrayBuffer
  }

  const response = await fetch(fileUrl)
  if (response.ok) return response.arrayBuffer()

  const { get } = await import('@vercel/blob')
  const blob = await get(fileUrl, { access: 'private' })
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    throw new Error(`Failed to fetch PDF: ${response.status}`)
  }

  return new Response(blob.stream).arrayBuffer()
}

export const readPdfArrayBuffer = readFileArrayBuffer

function computeConfidence(text: string): number {
  if (!text || text.trim().length === 0) return 0

  const length = text.trim().length

  // Length-based score: 500+ chars = good
  const lengthScore = Math.min(length / 500, 1.0)

  // Readability: penalize garbled characters
  const totalChars = length
  const goodChars = (text.match(/[a-zA-Z0-9\s.,;:!?@#%&*()[\]{}'"/\\-_çğıöşüÇĞİÖŞÜ]/g) ?? []).length
  const readabilityScore = totalChars > 0 ? goodChars / totalChars : 0

  // Combined score
  return Math.round((lengthScore * 0.6 + readabilityScore * 0.4) * 100) / 100
}
