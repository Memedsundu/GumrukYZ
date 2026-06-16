import { DocumentType, TradeFlow } from './enums.js'

export const DOCUMENT_COVERAGE_LABELS: Record<string, string> = {
  [DocumentType.INVOICE]: 'Fatura',
  [DocumentType.PACKING_LIST]: 'Çeki listesi',
  [DocumentType.TRANSPORT_DOC]: 'Taşıma belgesi',
  [DocumentType.BILL_OF_LADING]: 'Konşimento',
  [DocumentType.AIRWAY_BILL]: 'Hava konşimentosu',
  [DocumentType.LOADING_INSTRUCTION]: 'Yükleme talimatı',
  [DocumentType.DECLARATION_OUTPUT]: 'Beyanname çıktısı',
  [DocumentType.ORIGIN_DOC]: 'Menşe belgesi',
  [DocumentType.CERTIFICATE_OF_ORIGIN]: 'Menşe belgesi',
  [DocumentType.PERMIT_DOC]: 'İzin/uygunluk belgesi',
}

const TRANSPORT_DOC_TYPES = new Set<string>([
  DocumentType.TRANSPORT_DOC,
  DocumentType.BILL_OF_LADING,
  DocumentType.AIRWAY_BILL,
])

const ORIGIN_DOC_TYPES = new Set<string>([
  DocumentType.ORIGIN_DOC,
  DocumentType.CERTIFICATE_OF_ORIGIN,
])

const IMPORT_BASELINE = [
  DocumentType.INVOICE,
  DocumentType.PACKING_LIST,
  DocumentType.TRANSPORT_DOC,
  DocumentType.DECLARATION_OUTPUT,
] as const

const EXPORT_BASELINE = [
  DocumentType.INVOICE,
  DocumentType.PACKING_LIST,
  DocumentType.LOADING_INSTRUCTION,
  DocumentType.DECLARATION_OUTPUT,
] as const

export type DocumentCoverageDocument = {
  docType: string
  data?: Record<string, unknown>
}

export type DocumentCoverageSnapshot = {
  regimeCode?: string | null
}

export type DocumentCoverageResult = {
  present: string[]
  presentLabels: string[]
  missingExpected: string[]
  missingExpectedLabels: string[]
  missingConditional: string[]
  missingConditionalLabels: string[]
  isComplete: boolean
  limitationNotice: string
}

function labelFor(docType: string): string {
  return DOCUMENT_COVERAGE_LABELS[docType] ?? docType
}

function hasDocType(uploaded: Set<string>, docType: string): boolean {
  if (docType === DocumentType.TRANSPORT_DOC) {
    return [...TRANSPORT_DOC_TYPES].some((type) => uploaded.has(type))
  }
  if (docType === DocumentType.ORIGIN_DOC) {
    return [...ORIGIN_DOC_TYPES].some((type) => uploaded.has(type))
  }
  return uploaded.has(docType)
}

function hasOriginSignal(
  documents: DocumentCoverageDocument[],
  snapshot: DocumentCoverageSnapshot | null | undefined,
): boolean {
  if (snapshot?.regimeCode?.startsWith('4')) return true
  return documents.some((doc) => doc.data?.['tariff_preference'] === true)
}

function hasPermitSignal(documents: DocumentCoverageDocument[]): boolean {
  return documents.some((doc) => {
    const data = doc.data ?? {}
    return Boolean(
      data['permit_required'] === true ||
      data['product_control_required'] === true ||
      data['requires_permit'] === true,
    )
  })
}

export function classifyDocumentCoverage(params: {
  tradeFlow: string
  uploadedDocTypes: string[]
  documents?: DocumentCoverageDocument[]
  declarationSnapshot?: DocumentCoverageSnapshot | null
}): DocumentCoverageResult {
  const uploaded = new Set(
    params.uploadedDocTypes.filter((docType) => docType && docType !== DocumentType.UNCLASSIFIED),
  )
  const documents = params.documents ?? params.uploadedDocTypes.map((docType) => ({ docType }))
  const snapshot = params.declarationSnapshot ?? null

  const baseline =
    params.tradeFlow === TradeFlow.EXPORT
      ? EXPORT_BASELINE
      : params.tradeFlow === TradeFlow.IMPORT
        ? IMPORT_BASELINE
        : []

  const present = [...uploaded].filter((docType) => !docType.startsWith('UNCLASSIFIED'))
  const missingExpected = baseline.filter((docType) => !hasDocType(uploaded, docType))

  const missingConditional: string[] = []
  if (hasOriginSignal(documents, snapshot) && !hasDocType(uploaded, DocumentType.ORIGIN_DOC)) {
    missingConditional.push(DocumentType.ORIGIN_DOC)
  }
  if (hasPermitSignal(documents) && !uploaded.has(DocumentType.PERMIT_DOC)) {
    missingConditional.push(DocumentType.PERMIT_DOC)
  }

  const missingAll = [...missingExpected, ...missingConditional]
  const isComplete = missingAll.length === 0
  const limitationNotice = isComplete
    ? 'Analiz mevcut belgelerle tam kapsamda çalıştırıldı.'
    : 'Bu analiz mevcut belgelerle sınırlıdır.'

  return {
    present,
    presentLabels: present.map(labelFor),
    missingExpected,
    missingExpectedLabels: missingExpected.map(labelFor),
    missingConditional,
    missingConditionalLabels: missingConditional.map(labelFor),
    isComplete,
    limitationNotice,
  }
}
