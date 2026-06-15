import { createHash } from 'crypto'
import { parseSourceRefs, type SourceRef } from './report-format'

type DocumentVersionRef = {
  id: string
  docType: string
  latestVersionId: string | null
}

type ExpertEvidenceRef = {
  docType?: string | null
  field?: string | null
  value?: unknown
}

export function ruleFindingFingerprint(input: {
  ruleCode: string
  result: string
  message: string
  action: string
  sourceRefsJson: unknown
}): string {
  return stableHash({
    kind: 'rule',
    ruleCode: input.ruleCode,
    result: input.result,
    message: normalizeText(input.message),
    action: normalizeText(input.action),
    sourceRefs: normalizeRefs(parseSourceRefs(input.sourceRefsJson)),
  })
}

export function expertFindingFingerprint(input: {
  area: string
  severity: string
  title: string
  recommendation: string
  evidenceRefsJson: unknown
}): string {
  return stableHash({
    kind: 'expert',
    area: input.area,
    severity: input.severity,
    title: normalizeText(input.title),
    recommendation: normalizeText(input.recommendation),
    evidenceRefs: normalizeRefs(parseEvidenceRefs(input.evidenceRefsJson)),
  })
}

export function sourceVersionHash(input: {
  sourceRefsJson?: unknown
  evidenceRefsJson?: unknown
  documents: DocumentVersionRef[]
}): string {
  const docTypes = new Set<string>()
  for (const ref of parseSourceRefs(input.sourceRefsJson)) {
    if (ref.docType) docTypes.add(ref.docType)
  }
  for (const ref of parseEvidenceRefs(input.evidenceRefsJson)) {
    if (ref.docType) docTypes.add(ref.docType)
  }

  const scopedDocuments = docTypes.size > 0
    ? input.documents.filter((document) => docTypes.has(document.docType))
    : input.documents
  const documents = scopedDocuments.length > 0 ? scopedDocuments : input.documents

  return stableHash(
    documents
      .map((document) => ({
        id: document.id,
        docType: document.docType,
        latestVersionId: document.latestVersionId ?? 'missing',
      }))
      .sort((a, b) => `${a.docType}:${a.id}`.localeCompare(`${b.docType}:${b.id}`)),
  )
}

export function sourceDocumentLinks(input: {
  sourceRefsJson?: unknown
  evidenceRefsJson?: unknown
  documents: Array<DocumentVersionRef & { label: string; filename: string }>
}): Array<{ id: string; label: string; filename: string; docType: string }> {
  const docTypes = new Set<string>()
  for (const ref of parseSourceRefs(input.sourceRefsJson)) {
    if (ref.docType) docTypes.add(ref.docType)
  }
  for (const ref of parseEvidenceRefs(input.evidenceRefsJson)) {
    if (ref.docType) docTypes.add(ref.docType)
  }
  if (docTypes.size === 0) return []

  return input.documents
    .filter((document) => docTypes.has(document.docType))
    .map((document) => ({
      id: document.id,
      label: document.label,
      filename: document.filename,
      docType: document.docType,
    }))
}

function parseEvidenceRefs(value: unknown): ExpertEvidenceRef[] {
  if (!Array.isArray(value)) return []
  return value.filter((ref): ref is ExpertEvidenceRef => Boolean(ref) && typeof ref === 'object')
}

function normalizeRefs(refs: Array<SourceRef | ExpertEvidenceRef>) {
  return refs
    .map((ref) => ({
      docType: normalizeText(ref.docType ?? ''),
      field: normalizeText(ref.field ?? ''),
      value: normalizeText(ref.value == null ? '' : String(ref.value)),
    }))
    .sort((a, b) => `${a.docType}:${a.field}:${a.value}`.localeCompare(`${b.docType}:${b.field}:${b.value}`))
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
