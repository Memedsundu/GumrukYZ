import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
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
  countIntegratedExpertFindings,
  mergeReportSummaryText,
  parseExpertEvidenceRefs,
  parseExpertGtipCandidates,
  shouldIntegrateExpertReview,
} from '@/lib/expert-review-display'
import { getExpertReviewQuota } from '@/lib/expert-review-quota'
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
      riskReports: { orderBy: { generatedAt: 'desc' }, take: 1 },
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

  const errors = submission.ruleResults.filter((result) => result.result === 'FAIL')
  const warnings = submission.ruleResults.filter((result) => result.result === 'WARN')
  const reviewNeeded = submission.ruleResults.filter((result) => result.result === 'REVIEW_NEEDED')
  const passes = submission.ruleResults.filter((result) => result.result === 'PASS')
  // Superseded reviews (stale after reprocess) stay in the DB for audit but
  // are never shown as the current expert review.
  const currentExpertReviews = submission.expertReviews.filter((review) => !review.supersededAt)
  const expertReview = currentExpertReviews.find(shouldIntegrateExpertReview) ?? currentExpertReviews[0] ?? null
  const expertCounts = countIntegratedExpertFindings(expertReview)
  const expertQuota = await getExpertReviewQuota(user.tenantId)
  const canOverride = canManageTenant(user)

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

  const findingExplanations = parseFindingExplanations(report.findingExplanationsJson)

  const ruleFindings: ReportFindingItem[] = submission.ruleResults.map((result) => {
    const metadata = getRuleDisplayMetadata(result.ruleCode)
    const override = result.overrides[0]

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
      message: formatRuleResultMessage(result),
      action: recommendedActionForRuleResult(result.ruleCode, result.result),
      blocking: metadata.blocking,
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
      overrideReason: override?.reason ?? null,
      canOverride: canOverride && result.result !== 'PASS' && !override,
      defaultOpen: result.result === 'FAIL' || result.result === 'REVIEW_NEEDED',
    }
  })

  const expertFindings: ReportFindingItem[] = shouldIntegrateExpertReview(expertReview)
    ? expertReview.findings.map((finding, index) => {
        const evidenceRefs = parseExpertEvidenceRefs(finding.evidenceRefsJson)
        const gtipCandidates = parseExpertGtipCandidates(finding.gtipCandidatesJson ?? finding.evidenceRefsJson)
        return {
          id: finding.id,
          kind: 'expert',
          code: `YAPAY-ZEKA-${index + 1}`,
          result: finding.severity,
          resultLabel: resultLabel(finding.severity),
          category: expertFindingCategory(finding.area),
          sourceType: 'Yapay zeka yorumu',
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
          overrideReason: null,
          canOverride: false,
          defaultOpen: true,
        }
      })
    : []

  const findings = [...ruleFindings, ...expertFindings].sort(sortFindings)

  return (
    <ReportWorkspace
      submissionId={id}
      submissionTitle={submission.title}
      generatedAt={formatDateTime(report.generatedAt)}
      summaryText={mergeReportSummaryText(report.summaryText, expertReview)}
      counts={{
        errors: errors.length,
        warnings: warnings.length + expertCounts.warnings,
        reviewNeeded: reviewNeeded.length + expertCounts.reviewNeeded,
        passes: passes.length,
      }}
      expertQuota={expertQuota}
      hasCompletedExpertReview={expertReview?.status === 'COMPLETED'}
      documents={documents}
      findings={findings}
    />
  )
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
    LEGAL_CONTEXT: 'Yapay zeka',
  }
  return map[area] ?? 'Yapay zeka'
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
  const order = ['Belge seti', 'Belge kalitesi', 'Fatura', 'Çeki listesi', 'Beyanname', 'GTİP', 'Menşe', 'Kıymet', 'Taşıma', 'Yapay zeka']
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
