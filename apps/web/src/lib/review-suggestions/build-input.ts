import { buildReportPayload, type ReportPayload } from '@/lib/report-data'
import { assessRisk } from '@/lib/risk'
import {
  expertAreaToIssueType,
  presenceDocName,
  ruleCodeToIssueType,
} from './catalog'
import type {
  IssueSeverity,
  OverallRisk,
  SuggestionEvidence,
  SuggestionInput,
  SuggestionInputIssue,
  SuggestionLanguage,
  OcrUncertainField,
} from './types'

const ACTIONABLE = new Set(['FAIL', 'WARN', 'REVIEW_NEEDED'])

function severityFromResult(result: string): IssueSeverity {
  if (result === 'FAIL') return 'high'
  if (result === 'WARN') return 'medium'
  return 'low'
}

function overallRisk(counts: ReportPayload['counts']): OverallRisk {
  const level = assessRisk({
    errors: counts.errors,
    warnings: counts.warnings,
    reviews: counts.reviewNeeded,
  }).level
  return level === 'high' ? 'high' : level === 'medium' ? 'medium' : 'low'
}

/** Best-effort normalization of a raw source ref object into evidence. */
function toEvidence(ref: unknown): SuggestionEvidence {
  const r = (ref && typeof ref === 'object' ? ref : {}) as Record<string, unknown>
  const document = String(r['docType'] ?? r['document'] ?? r['doc'] ?? 'belge')
  const pageRaw = r['page']
  const page = typeof pageRaw === 'number' && Number.isFinite(pageRaw) ? pageRaw : 1
  const field = String(r['field'] ?? r['key'] ?? '')
  const value = r['value'] == null ? '' : String(r['value'])
  return { document, page, field, value }
}

export async function buildSuggestionInput(
  submissionId: string,
  tenantId: string,
  language: SuggestionLanguage = 'tr',
): Promise<SuggestionInput | null> {
  const payload = await buildReportPayload(submissionId, tenantId)
  if (!payload) return null

  const issues: SuggestionInputIssue[] = []

  // Deterministic rule findings (non-PASS).
  for (const result of payload.ruleResults) {
    if (!ACTIONABLE.has(result.result)) continue
    issues.push({
      issue_id: result.id,
      issue_type: ruleCodeToIssueType(result.ruleCode),
      severity: severityFromResult(result.result),
      confidence: 0.9,
      title: result.metadata.turkishTitle,
      description: result.displayMessage,
      evidence: result.sourceRefs.slice(0, 4).map(toEvidence),
      recommended_action: result.recommendedAction,
    })
  }

  // Expert AI findings (only when integrated into the current report).
  if (payload.report.expertIncluded && payload.expertReview) {
    for (const finding of payload.expertReview.findings) {
      issues.push({
        issue_id: finding.id,
        issue_type: expertAreaToIssueType(finding.area),
        severity: finding.severity === 'REVIEW_NEEDED' ? 'low' : 'medium',
        confidence:
          typeof finding.confidence === 'number' ? finding.confidence : 0.7,
        title: finding.title,
        description: finding.explanation,
        evidence: (finding.evidenceRefs ?? []).slice(0, 4).map(toEvidence),
        recommended_action: finding.recommendation,
      })
    }
  }

  // Missing documents from failing presence rules.
  const missingSet = new Set<string>()
  for (const result of payload.ruleResults) {
    if (result.result !== 'FAIL' && result.result !== 'WARN') continue
    const name = presenceDocName(result.ruleCode, language)
    if (name) missingSet.add(name)
  }

  // OCR uncertainty from OCR/quality findings.
  const ocrUncertainFields: OcrUncertainField[] = []
  for (const result of payload.ruleResults) {
    if (!ACTIONABLE.has(result.result)) continue
    if (ruleCodeToIssueType(result.ruleCode) !== 'ocr_uncertainty') continue
    const refs = result.sourceRefs.length > 0 ? result.sourceRefs : [null]
    for (const ref of refs.slice(0, 3)) {
      const ev = toEvidence(ref)
      ocrUncertainFields.push({
        document: ev.document,
        page: ev.page,
        field: ev.field || 'extraction',
        value: ev.value || 'uncertain',
      })
    }
  }

  const documentTypes = Array.from(
    new Set(
      payload.documents
        .map((doc) => doc.docType)
        .filter((docType) => docType && docType !== 'UNCLASSIFIED')
        .map((docType) => docType.toLowerCase()),
    ),
  )

  return {
    case_id: submissionId,
    language,
    document_types_uploaded: documentTypes,
    overall_risk: overallRisk(payload.counts),
    issues,
    missing_documents: Array.from(missingSet),
    ocr_uncertain_fields: ocrUncertainFields,
  }
}
