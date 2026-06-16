import {
  classifyDocumentCoverage,
  type DocumentCoverageResult,
} from '@gumrukyz/domain'

type SubmissionDocumentInput = {
  docType: string
  isIgnored?: boolean
  latestVersion?: {
    extractions?: Array<{ structuredJson?: unknown; structuredDataJson?: unknown }>
  } | null
}

function extractionData(
  extraction: { structuredJson?: unknown; structuredDataJson?: unknown } | undefined,
): Record<string, unknown> {
  const raw = extraction?.structuredJson ?? extraction?.structuredDataJson
  return (raw as Record<string, unknown> | undefined) ?? {}
}

export function buildSubmissionDocumentCoverage(params: {
  tradeFlow: string
  documents: SubmissionDocumentInput[]
  declarationSnapshot?: { regimeCode?: string | null } | null
}): DocumentCoverageResult {
  const activeDocuments = params.documents.filter((document) => !document.isIgnored)

  return classifyDocumentCoverage({
    tradeFlow: params.tradeFlow,
    uploadedDocTypes: activeDocuments.map((document) => document.docType),
    documents: activeDocuments.map((document) => ({
      docType: document.docType,
      data: extractionData(document.latestVersion?.extractions?.[0]),
    })),
    declarationSnapshot: params.declarationSnapshot,
  })
}
