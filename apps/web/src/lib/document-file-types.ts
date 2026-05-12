const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/bmp',
  'image/tiff',
  'image/heif',
  'image/heic',
  'text/html',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const SUPPORTED_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.bmp',
  '.tif',
  '.tiff',
  '.heif',
  '.heic',
  '.html',
  '.htm',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.pptx',
]

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heif': 'image/heif',
  '.heic': 'image/heic',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export const SUPPORTED_UPLOAD_ACCEPT = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.bmp',
  '.tif',
  '.tiff',
  '.heif',
  '.heic',
  '.html',
  '.htm',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.pptx',
  ...SUPPORTED_UPLOAD_MIME_TYPES,
].join(',')

export const SUPPORTED_UPLOAD_LABEL =
  'PDF, görsel, Word, Excel, PowerPoint veya HTML dosyaları kabul edilir'

export function isSupportedUploadFile(filename: string, mimeType?: string | null): boolean {
  const normalizedMime = normalizeMimeType(mimeType)
  if (normalizedMime && SUPPORTED_UPLOAD_MIME_TYPES.has(normalizedMime)) return true
  return SUPPORTED_UPLOAD_EXTENSIONS.some((extension) =>
    filename.toLowerCase().endsWith(extension),
  )
}

export function inferDocumentContentType(filename: string, mimeType?: string | null): string {
  const normalizedMime = normalizeMimeType(mimeType)
  if (normalizedMime && normalizedMime !== 'application/octet-stream') return normalizedMime

  const extension = SUPPORTED_UPLOAD_EXTENSIONS.find((candidate) =>
    filename.toLowerCase().endsWith(candidate),
  )

  return extension ? CONTENT_TYPES_BY_EXTENSION[extension] : 'application/octet-stream'
}

export function isPdfDocument(filename: string, mimeType?: string | null): boolean {
  return inferDocumentContentType(filename, mimeType) === 'application/pdf'
}

function normalizeMimeType(mimeType?: string | null): string | null {
  const trimmed = mimeType?.trim().toLowerCase()
  return trimmed ? trimmed : null
}
