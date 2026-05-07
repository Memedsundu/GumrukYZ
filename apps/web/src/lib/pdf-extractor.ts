/**
 * PDF text extraction using pdfjs-dist (Tier 1 extraction).
 *
 * Confidence scoring:
 * - Based on extracted text length and character quality
 * - < 0.5 = low confidence → triggers OCR fallback or REVIEW_NEEDED flag
 */

export interface TextExtractionResult {
  text: string
  confidence: number
  pageCount: number
  method: 'TEXT_PDF' | 'EMPTY'
}

export async function extractTextFromPdf(fileUrl: string): Promise<TextExtractionResult> {
  try {
    // Dynamically import pdfjs-dist to avoid SSR issues
    const pdfjsLib = await import('pdfjs-dist')

    // Disable worker for Node.js environment
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''

    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
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
