import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { buildSubmissionDocumentCoverage } from '@/lib/document-coverage'
import { prisma, type Prisma } from '@gumrukyz/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import {
  docTypeLabel,
  formatRuleResultMessage,
  formatSourceRef,
  getRuleDisplayMetadata,
  parseFindingExplanations,
  parseSourceRefs,
  recommendedActionForRuleResult,
  resultLabel,
} from '@/lib/report-format'
import {
  expertFindingFingerprint,
  ruleFindingFingerprint,
  sourceDocumentLinks,
  sourceVersionHash,
} from '@/lib/report-checklist-fingerprint'
import {
  countIntegratedExpertFindings,
  expertReviewDisplayStatus,
  expertReviewStatusMessage,
  parseExpertEvidenceRefs,
  parseExpertGtipCandidates,
  shouldIntegrateExpertReview,
} from '@/lib/expert-review-display'
import { filterExpertFindingsAgainstRules } from '@/lib/finding-dedupe'
import { getExpertReviewQuota } from '@/lib/expert-review-quota'
import { willChargeAnalysis } from '@/lib/entitlements'
import ReportWorkspace, {
  type ReportAiValidationItem,
  type ReportCitationItem,
  type ReportDocumentItem,
  type ReportFindingItem,
  type ReportGtipCandidate,
} from './report-workspace'

interface Props {
  params: Promise<{ id: string }>
}

const ACTIVE_REPORT_JOB_STATUSES = [
  'PENDING',
  'CLASSIFYING',
  'EXTRACTING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
  'GENERATING_REPORT',
]

export default async function ReportPage({ params }: Props) {
  const { id } = await params
  const user = await getAuthenticatedUser()

  const submission = await prisma.submission.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      documents: {
        orderBy: { createdAt: 'asc' },
        include: {
          latestVersion: {
            include: {
              extractions: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          },
        },
      },
      riskReports: { orderBy: { generatedAt: 'desc' }, take: 10 },
      processingJobs: {
        where: { status: { in: ACTIVE_REPORT_JOB_STATUSES } },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
      ruleResults: {
        orderBy: [{ severity: 'asc' }, { ruleCode: 'asc' }],
        include: {
          overrides: { orderBy: { createdAt: 'desc' }, take: 1 },
          citations: {
            include: {
              ruleLegalCitation: {
                include: { sourceDocument: true },
              },
            },
          },
          aiValidations: { orderBy: { createdAt: 'desc' } },
        },
      },
      expertReviews: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          findings: {
            orderBy: { createdAt: 'asc' },
            include: {
              citations: {
                include: {
                  regulationChunk: {
                    include: { sourceDocument: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!submission) notFound()

  const report = submission.riskReports[0]
  if (!report) {
    return (
      <div className="p-8">
        <p className="text-ink-muted">Henüz rapor üretilmedi. Önce analizi başlatın.</p>
        <Link href={`/submissions/${id}`} className="mt-4 inline-block text-sm text-brand-600 hover:text-brand-700">
          ← Dosyaya dön
        </Link>
      </div>
    )
  }

  const currentReport = pickCurrentReport(submission.riskReports, submission.currentReportJobId) ?? report
  const effectiveReportJobId = currentReport.processingJobId ?? submission.currentReportJobId
  const reportRuleResults = filterByReportJob(submission.ruleResults, effectiveReportJobId)
  const reportExpertReviews = filterByReportJob(submission.expertReviews, effectiveReportJobId)
  const activeJob = submission.processingJobs[0] ?? null
  const reportState = {
    stale: Boolean(submission.reportStaleAt) || Boolean(activeJob),
    readonly: Boolean(submission.reportStaleAt) || Boolean(activeJob),
    staleReason: activeJob
      ? 'Düzeltilen belge yeniden analiz ediliyor. Bu sırada eski rapor referans olarak gösterilir.'
      : submission.reportStaleReason,
    activeJobId: activeJob?.id ?? null,
    validationRequired: Boolean(submission.reportStaleAt) && submission.classificationStatus !== 'VALIDATED',
  }

  const errors = reportRuleResults.filter((result) => result.result === 'FAIL')
  const warnings = reportRuleResults.filter((result) => result.result === 'WARN')
  const reviewNeeded = reportRuleResults.filter((result) => result.result === 'REVIEW_NEEDED')
  const passes = reportRuleResults.filter((result) => result.result === 'PASS')
  // Superseded reviews (stale after reprocess) stay in the DB for audit but
  // are never shown as the current expert review.
  const currentExpertReviews = reportExpertReviews.filter((review) => !review.supersededAt)
  const expertReview = currentExpertReviews.find(shouldIntegrateExpertReview) ?? currentExpertReviews[0] ?? null
  const visibleExpertFindings = shouldIntegrateExpertReview(expertReview)
    ? filterExpertFindingsAgainstRules(expertReview.findings, reportRuleResults)
    : []
  const visibleExpertReview = expertReview && visibleExpertFindings.length > 0
    ? { ...expertReview, findings: visibleExpertFindings }
    : null
  const expertStatus = expertReviewDisplayStatus(expertReview, visibleExpertFindings)
  const expertCounts = countIntegratedExpertFindings(visibleExpertReview)
  const expertQuota = await getExpertReviewQuota(user.tenantId)
  const willChargeReanalysis = await willChargeAnalysis({ tenantId: user.tenantId, submissionId: id })
  const canOverride = canManageTenant(user)

  const declarationSnapshot = await prisma.declarationSnapshot.findFirst({
    where: {
      submissionId: id,
      tenantId: user.tenantId,
      ...(effectiveReportJobId ? { processingJobId: effectiveReportJobId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  const documentCoverage = buildSubmissionDocumentCoverage({
    tradeFlow: submission.tradeFlow,
    documents: submission.documents,
    declarationSnapshot,
  })

  const documents: ReportDocumentItem[] = submission.documents.map((document) => ({
    id: document.id,
    filename: document.latestVersion?.originalFilename ?? document.label,
    label: document.label,
    docType: docTypeLabel(document.docType),
    status: document.status,
    isIgnored: document.isIgnored,
    extractionConfidence: document.latestVersion?.extractions[0]?.confidence ?? null,
    classificationConfidence: document.suggestedDocTypeConfidence,
  }))
  const documentVersionRefs = submission.documents.map((document) => ({
    id: document.id,
    label: document.label,
    filename: document.latestVersion?.originalFilename ?? document.label,
    docType: document.docType,
    latestVersionId: document.latestVersionId,
  }))

  const emptyChecklist = { completedAt: null, completedByEmail: null, note: null }

  const findingExplanations = parseFindingExplanations(currentReport.findingExplanationsJson)

  const ruleFindings: ReportFindingItem[] = reportRuleResults.map((result) => {
    const metadata = getRuleDisplayMetadata(result.ruleCode)
    const override = result.overrides[0]
    const message = formatRuleResultMessage(result)
    const action = recommendedActionForRuleResult(result.ruleCode, result.result)

    return {
      id: result.id,
      kind: 'rule',
      code: result.ruleCode,
      result: result.result,
      resultLabel: resultLabel(result.result),
      category: normalizeReportCategory(metadata.category, result.ruleCode),
      sourceType: 'Kural sonucu',
      title: metadata.turkishTitle,
      explanation: metadata.operationalExplanation,
      message,
      action,
      blocking: metadata.blocking && result.result === 'FAIL',
      confidence: null,
      sourceRefs: parseSourceRefs(result.sourceRefsJson).map(formatSourceRef),
      citations: result.citations.map((citation): ReportCitationItem => {
        const legal = citation.ruleLegalCitation
        return {
          id: citation.id,
          title: legal.sourceDocument.title,
          label: legal.articleLabel,
          excerpt: truncate(legal.excerpt, 360),
          url: legal.url,
        }
      }),
      aiValidations: result.aiValidations.map((validation): ReportAiValidationItem => ({
        id: validation.id,
        statusLabel: aiRuleValidationLabel(validation.status),
        confidence: validation.confidence,
        explanation: validation.explanation,
        recommendation: validation.recommendation,
      })),
      gtipCandidates: [],
      summaryExplanation: findingExplanations.get(result.id)
        ?? findingExplanations.get(`ai-rule:${result.id}`)
        ?? null,
      sourceDocuments: sourceDocumentLinks({
        sourceRefsJson: result.sourceRefsJson,
        documents: documentVersionRefs,
      }),
      checklistFingerprint: ruleFindingFingerprint({
        ruleCode: result.ruleCode,
        result: result.result,
        message,
        action,
        sourceRefsJson: result.sourceRefsJson,
      }),
      sourceVersionHash: sourceVersionHash({
        sourceRefsJson: result.sourceRefsJson,
        documents: documentVersionRefs,
      }),
      processingJobId: result.processingJobId ?? null,
      overrideReason: override?.reason ?? null,
      canOverride: canOverride && !reportState.readonly && result.result !== 'PASS' && !override,
      defaultOpen: result.result === 'FAIL' || result.result === 'REVIEW_NEEDED',
      checklist: emptyChecklist,
    }
  })

  const expertFindings: ReportFindingItem[] = visibleExpertReview
    ? visibleExpertFindings.map((finding, index) => {
        const evidenceRefs = parseExpertEvidenceRefs(finding.evidenceRefsJson)
        const gtipCandidates = parseExpertGtipCandidates(finding.gtipCandidatesJson ?? finding.evidenceRefsJson)
        return {
          id: finding.id,
          kind: 'expert',
          code: `UZMAN-INCELEME-${index + 1}`,
          result: finding.severity,
          resultLabel: resultLabel(finding.severity),
          category: expertFindingCategory(finding.area),
          sourceType: 'Uzman İncelemesi',
          title: finding.title,
          explanation: expertAreaLabel(finding.area),
          message: finding.explanation,
          action: finding.recommendation,
          blocking: false,
          confidence: finding.confidence,
          sourceRefs: formatExpertEvidence(evidenceRefs),
          citations: finding.citations.map((citation): ReportCitationItem => {
            const chunk = citation.regulationChunk
            return {
              id: citation.id,
              title: chunk.sourceDocument.title,
              label: chunk.articleLabel,
              excerpt: truncate(chunk.chunkText, 360),
              url: chunk.sourceUrl ?? chunk.sourceDocument.url,
            }
          }),
          aiValidations: [],
          gtipCandidates: gtipCandidates.map((candidate): ReportGtipCandidate => ({
            code: candidate.code,
            confidence: candidate.confidence,
            rationale: candidate.rationale,
            requiredEvidence: candidate.requiredEvidence,
          })),
          summaryExplanation: null,
          sourceDocuments: sourceDocumentLinks({
            evidenceRefsJson: finding.evidenceRefsJson,
            documents: documentVersionRefs,
          }),
          checklistFingerprint: expertFindingFingerprint({
            area: finding.area,
            severity: finding.severity,
            title: finding.title,
            recommendation: finding.recommendation,
            evidenceRefsJson: finding.evidenceRefsJson,
          }),
          sourceVersionHash: sourceVersionHash({
            evidenceRefsJson: finding.evidenceRefsJson,
            documents: documentVersionRefs,
          }),
          processingJobId: visibleExpertReview.processingJobId ?? null,
          overrideReason: null,
          canOverride: false,
          defaultOpen: true,
          checklist: emptyChecklist,
        }
      })
    : []

  const findingsWithoutChecklist = [...ruleFindings, ...expertFindings].sort(sortFindings)
  const checklistByFinding = await loadChecklistStates({
    tenantId: user.tenantId,
    submissionId: id,
    findings: findingsWithoutChecklist,
  })
  const findings = findingsWithoutChecklist.map((finding) => ({
    ...finding,
    checklist: checklistByFinding.get(`${finding.kind}:${finding.id}`) ?? emptyChecklist,
  }))

  return (
    <ReportWorkspace
      submissionId={id}
      submissionTitle={submission.title}
      generatedAt={formatDateTime(currentReport.generatedAt)}
      counts={{
        errors: errors.length,
        warnings: warnings.length + expertCounts.warnings,
        reviewNeeded: reviewNeeded.length + expertCounts.reviewNeeded,
        passes: passes.length,
      }}
      expertQuota={expertQuota}
      hasCompletedExpertReview={expertReview?.status === 'COMPLETED'}
      expertReviewStatusMessage={expertReviewStatusMessage(expertStatus, expertReview?.summary)}
      documents={documents}
      findings={findings}
      reportState={reportState}
      willChargeReanalysis={willChargeReanalysis}
      documentCoverage={documentCoverage}
    />
  )
}

function pickCurrentReport<T extends { processingJobId: string | null }>(
  reports: T[],
  currentReportJobId: string | null,
): T | null {
  if (currentReportJobId) {
    return reports.find((report) => report.processingJobId === currentReportJobId) ?? null
  }
  return reports[0] ?? null
}

function filterByReportJob<T extends { processingJobId: string | null }>(
  rows: T[],
  reportJobId: string | null,
): T[] {
  if (reportJobId) return rows.filter((row) => row.processingJobId === reportJobId)
  return rows.filter((row) => row.processingJobId === null)
}

async function loadChecklistStates({
  tenantId,
  submissionId,
  findings,
}: {
  tenantId: string
  submissionId: string
  findings: ReportFindingItem[]
}) {
  const ruleIds = findings.filter((finding) => finding.kind === 'rule').map((finding) => finding.id)
  const expertIds = findings.filter((finding) => finding.kind === 'expert').map((finding) => finding.id)
  const fingerprints = [...new Set(findings.map((finding) => finding.checklistFingerprint))]
  const sourceHashes = [...new Set(findings.map((finding) => finding.sourceVersionHash))]
  const filters: Prisma.FindingChecklistStateWhereInput[] = []

  if (ruleIds.length > 0) filters.push({ findingKind: 'rule', findingId: { in: ruleIds } })
  if (expertIds.length > 0) filters.push({ findingKind: 'expert', findingId: { in: expertIds } })
  if (fingerprints.length > 0 && sourceHashes.length > 0) {
    filters.push({
      findingFingerprint: { in: fingerprints },
      sourceVersionHash: { in: sourceHashes },
    })
  }

  if (filters.length === 0) return new Map<string, { completedAt: string | null; completedByEmail: string | null; note: string | null }>()

  const states = await prisma.findingChecklistState.findMany({
    where: {
      tenantId,
      submissionId,
      OR: filters,
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      completedBy: { select: { email: true } },
    },
  })

  const exactStates = new Map<string, (typeof states)[number]>()
  const carryStates = new Map<string, (typeof states)[number]>()
  for (const state of states) {
    const exactKey = `${state.findingKind}:${state.findingId}`
    if (!exactStates.has(exactKey)) exactStates.set(exactKey, state)

    if (state.findingFingerprint && state.sourceVersionHash) {
      const carryKey = `${state.findingKind}:${state.findingFingerprint}:${state.sourceVersionHash}`
      if (!carryStates.has(carryKey)) carryStates.set(carryKey, state)
    }
  }

  const checklistByFinding = new Map<string, { completedAt: string | null; completedByEmail: string | null; note: string | null }>()
  for (const finding of findings) {
    const exactKey = `${finding.kind}:${finding.id}`
    const carryKey = `${finding.kind}:${finding.checklistFingerprint}:${finding.sourceVersionHash}`
    const state = exactStates.get(exactKey) ?? carryStates.get(carryKey)
    if (!state) continue

    checklistByFinding.set(exactKey, {
      completedAt: state.completedAt?.toISOString() ?? null,
      completedByEmail: state.completedBy?.email ?? null,
      note: state.note ?? null,
    })
  }

  return checklistByFinding
}

function normalizeReportCategory(category: string, ruleCode: string): string {
  if (ruleCode.startsWith('QUAL-') || ruleCode === 'OCR-001') return 'Belge kalitesi'
  if (category === 'Belge varlığı') return 'Belge seti'
  if (category === 'Belge kalitesi' || category === 'Belge okuma') return 'Belge kalitesi'
  if (ruleCode.startsWith('INV-')) return 'Fatura'
  if (ruleCode.startsWith('PL-')) return 'Çeki listesi'
  if (ruleCode.startsWith('GTIP-')) return 'GTİP'
  if (ruleCode.startsWith('DECL-002') || ruleCode.startsWith('COO-')) return 'Menşe'
  if (ruleCode.startsWith('DECL-')) return 'Beyanname'
  if (ruleCode.startsWith('BL-')) return 'Taşıma'
  if (ruleCode.startsWith('VAL-')) return 'Kıymet'
  if (ruleCode.startsWith('EXP-004')) return 'Menşe'
  if (ruleCode.startsWith('EXP-')) return 'Beyanname'
  if (category === 'Kıymet' || category === 'Teslim şekli') return 'Kıymet'
  if (category === 'Paketleme' || category === 'Miktar' || category === 'Ağırlık') return 'Çeki listesi'
  if (category === 'Taşıma' || category === 'Ticaret akışı') return 'Taşıma'
  if (category === 'Fatura' || category === 'Çeki listesi' || category === 'Beyanname' || category === 'GTİP' || category === 'Menşe') {
    return category
  }
  return 'Diğer'
}

function expertFindingCategory(area: string): string {
  const map: Record<string, string> = {
    GTIP_PLAUSIBILITY: 'GTİP',
    PERMIT_PRODUCT_CONTROL: 'GTİP',
    REGIME_CHOICE: 'Beyanname',
    VALUATION: 'Kıymet',
    ORIGIN_PREFERENTIAL: 'Menşe',
    INCOTERM: 'Kıymet',
    DOCUMENT_CONSISTENCY: 'Belge seti',
    DOCUMENT_QUALITY: 'Belge kalitesi',
    LEGAL_CONTEXT: 'Uzman İncelemesi',
  }
  return map[area] ?? 'Uzman İncelemesi'
}

function sortFindings(a: ReportFindingItem, b: ReportFindingItem): number {
  const resultDiff = resultPriority(a.result) - resultPriority(b.result)
  if (resultDiff !== 0) return resultDiff
  const categoryDiff = categoryPriority(a.category) - categoryPriority(b.category)
  if (categoryDiff !== 0) return categoryDiff
  return a.code.localeCompare(b.code, 'tr')
}

function resultPriority(result: string): number {
  if (result === 'FAIL') return 0
  if (result === 'REVIEW_NEEDED') return 1
  if (result === 'WARN') return 2
  return 3
}

function categoryPriority(category: string): number {
  const order = ['Belge seti', 'Belge kalitesi', 'Fatura', 'Çeki listesi', 'Beyanname', 'GTİP', 'Menşe', 'Kıymet', 'Taşıma', 'Uzman İncelemesi']
  const index = order.indexOf(category)
  return index === -1 ? order.length : index
}

function aiRuleValidationLabel(status: string): string {
  const map: Record<string, string> = {
    LIKELY_CORRECT: 'Sonuç makul',
    POTENTIAL_FALSE_POSITIVE: 'Yanlış pozitif olabilir',
    POTENTIAL_FALSE_NEGATIVE: 'Kaçan risk olabilir',
    NEEDS_HUMAN_REVIEW: 'Manuel inceleme gerekir',
  }
  return map[status] ?? status
}

function expertAreaLabel(area: string): string {
  const map: Record<string, string> = {
    GTIP_PLAUSIBILITY: 'GTİP yorumu',
    PERMIT_PRODUCT_CONTROL: 'İzin / ürün kontrolü',
    REGIME_CHOICE: 'Rejim seçimi',
    VALUATION: 'Kıymet',
    ORIGIN_PREFERENTIAL: 'Menşe / tercihli rejim',
    INCOTERM: 'Incoterms',
    DOCUMENT_CONSISTENCY: 'Belge tutarlılığı',
    DOCUMENT_QUALITY: 'Belge kalitesi',
    LEGAL_CONTEXT: 'Mevzuat kapsamı',
  }
  return map[area] ?? area
}

function formatExpertEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const ref = item as { docType?: unknown; field?: unknown; value?: unknown }
      return [ref.docType, ref.field, ref.value].filter(Boolean).join(' / ')
    })
    .filter((item): item is string => Boolean(item))
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trim()}…`
}
