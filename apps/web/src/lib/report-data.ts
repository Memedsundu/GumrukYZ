import { prisma } from '@gumrukyz/db'
import {
  formatRuleResultMessage,
  formatSourceRef,
  getRuleDisplayMetadata,
  parseSourceRefs,
  recommendedActionForRuleResult,
  resultLabel,
  severityLabel,
} from './report-format'
import {
  countIntegratedExpertFindings,
  mergeReportSummaryText,
  parseExpertEvidenceRefs,
  parseExpertGtipCandidates,
  shouldIntegrateExpertReview,
} from './expert-review-display'

export type ReportPayload = NonNullable<Awaited<ReturnType<typeof buildReportPayload>>>

export async function buildReportPayload(submissionId: string, tenantId: string) {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, tenantId },
    include: {
      riskReports: { orderBy: { generatedAt: 'desc' }, take: 1 },
      documents: {
        include: { latestVersion: true },
        orderBy: { createdAt: 'asc' },
      },
      ruleResults: {
        orderBy: [{ severity: 'asc' }, { ruleCode: 'asc' }],
        include: {
          overrides: { orderBy: { createdAt: 'desc' } },
          citations: {
            include: {
              ruleLegalCitation: {
                include: { sourceDocument: true },
              },
            },
          },
          aiValidations: {
            orderBy: { createdAt: 'desc' },
          },
        },
      },
      expertReviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
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

  if (!submission) return null

  const report = submission.riskReports[0]
  if (!report) return null
  const expertReview = submission.expertReviews[0] ?? null
  const expertCounts = countIntegratedExpertFindings(expertReview)
  const mergedSummaryText = mergeReportSummaryText(report.summaryText, expertReview)
  const mergedWarnings = report.totalWarnings + expertCounts.warnings
  const mergedReviewNeeded = report.totalReviewNeeded + expertCounts.reviewNeeded

  const deterministicActionSummary = submission.ruleResults
    .filter((result) => result.result !== 'PASS' && result.result !== 'SKIP')
    .sort((a, b) => resultPriority(a.result) - resultPriority(b.result))
    .map((result) => ({
      ruleCode: result.ruleCode,
      result: result.result,
      title: getRuleDisplayMetadata(result.ruleCode).turkishTitle,
      description: formatRuleResultMessage(result),
      action: recommendedActionForRuleResult(result.ruleCode, result.result),
      source: 'RULE' as const,
    }))
  const expertActionSummary = shouldIntegrateExpertReview(expertReview)
    ? expertReview.findings.map((finding, index) => ({
        ruleCode: `AI-UZMAN-${index + 1}`,
        result: finding.severity,
        title: `Uzman AI: ${finding.title}`,
        description: finding.explanation,
        action: finding.recommendation,
        source: 'EXPERT_REVIEW' as const,
      }))
    : []
  const actionSummary = [...deterministicActionSummary, ...expertActionSummary]
    .sort((a, b) => resultPriority(a.result) - resultPriority(b.result))
    .slice(0, 8)

  return {
    generatedAt: new Date().toISOString(),
    submission: {
      id: submission.id,
      title: submission.title,
      status: submission.status,
      tradeFlow: submission.tradeFlow,
      dataClassification: submission.dataClassification,
      createdAt: submission.createdAt.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
    },
    report: {
      id: report.id,
      generatedAt: report.generatedAt.toISOString(),
      summaryText: mergedSummaryText,
      totalErrors: report.totalErrors,
      totalWarnings: mergedWarnings,
      totalReviewNeeded: mergedReviewNeeded,
      deterministicTotals: {
        totalErrors: report.totalErrors,
        totalWarnings: report.totalWarnings,
        totalReviewNeeded: report.totalReviewNeeded,
      },
      expertIncluded: shouldIntegrateExpertReview(expertReview),
    },
    documents: submission.documents.map((document) => ({
      id: document.id,
      docType: document.docType,
      status: document.status,
      originalFilename: document.latestVersion?.originalFilename ?? null,
      mimeType: document.latestVersion?.mimeType ?? null,
      fileSizeBytes: document.latestVersion?.fileSizeBytes ?? null,
      uploadedAt: document.latestVersion?.uploadedAt.toISOString() ?? document.createdAt.toISOString(),
    })),
    counts: {
      errors: submission.ruleResults.filter((result) => result.result === 'FAIL').length,
      warnings: submission.ruleResults.filter((result) => result.result === 'WARN').length + expertCounts.warnings,
      reviewNeeded: submission.ruleResults.filter((result) => result.result === 'REVIEW_NEEDED').length + expertCounts.reviewNeeded,
      passes: submission.ruleResults.filter((result) => result.result === 'PASS').length,
    },
    actionSummary,
    expertReview: expertReview
      ? {
          id: expertReview.id,
          status: expertReview.status,
          legalContextStatus: expertReview.legalContextStatus,
          model: expertReview.model,
          overallRisk: expertReview.overallRisk,
          summary: expertReview.summary,
          completedAt: expertReview.completedAt?.toISOString() ?? null,
          findings: expertReview.findings.map((finding) => ({
            id: finding.id,
            area: finding.area,
            severity: finding.severity,
            confidence: finding.confidence,
            title: finding.title,
            explanation: finding.explanation,
            recommendation: finding.recommendation,
            evidenceRefs: parseExpertEvidenceRefs(finding.evidenceRefsJson),
            gtipCandidates: parseExpertGtipCandidates(finding.evidenceRefsJson),
            citations: finding.citations.map((citation) => ({
              id: citation.id,
              chunkId: citation.regulationChunk.id,
              sourceTitle: citation.regulationChunk.sourceDocument.title,
              sourceType: citation.regulationChunk.sourceDocument.sourceType,
              jurisdiction: citation.regulationChunk.sourceDocument.jurisdiction,
              articleLabel: citation.regulationChunk.articleLabel,
              excerpt: citation.regulationChunk.chunkText.slice(0, 500),
              url: citation.regulationChunk.sourceUrl ?? citation.regulationChunk.sourceDocument.url,
              verifiedAt: citation.regulationChunk.verifiedAt?.toISOString()
                ?? citation.regulationChunk.sourceDocument.lastVerifiedAt?.toISOString()
                ?? citation.regulationChunk.sourceDocument.snapshotFetchedAt?.toISOString()
                ?? null,
            })),
            createdAt: finding.createdAt.toISOString(),
          })),
        }
      : null,
    ruleResults: submission.ruleResults.map((result) => {
      const sourceRefs = parseSourceRefs(result.sourceRefsJson)
      return {
        id: result.id,
        ruleCode: result.ruleCode,
        severity: result.severity,
        severityLabel: severityLabel(result.severity),
        result: result.result,
        resultLabel: resultLabel(result.result),
        message: result.message,
        displayMessage: formatRuleResultMessage(result),
        metadata: getRuleDisplayMetadata(result.ruleCode),
        recommendedAction: recommendedActionForRuleResult(result.ruleCode, result.result),
        sourceRefs,
        sourceRefsDisplay: sourceRefs.map(formatSourceRef),
        legalCitations: result.citations.map((citation) => ({
          id: citation.ruleLegalCitation.id,
          sourceTitle: citation.ruleLegalCitation.sourceDocument.title,
          sourceType: citation.ruleLegalCitation.sourceDocument.sourceType,
          jurisdiction: citation.ruleLegalCitation.sourceDocument.jurisdiction,
          articleLabel: citation.ruleLegalCitation.articleLabel,
          excerpt: citation.ruleLegalCitation.excerpt,
          url: citation.ruleLegalCitation.url,
          verifiedAt: citation.ruleLegalCitation.verifiedAt?.toISOString()
            ?? citation.ruleLegalCitation.sourceDocument.lastVerifiedAt?.toISOString()
            ?? citation.ruleLegalCitation.sourceDocument.snapshotFetchedAt?.toISOString()
            ?? null,
        })),
        createdAt: result.createdAt.toISOString(),
        overrides: result.overrides.map((override) => ({
          id: override.id,
          originalResult: override.originalResult,
          newResult: override.newResult,
          reason: override.reason,
          createdAt: override.createdAt.toISOString(),
        })),
        aiValidations: result.aiValidations.map((validation) => ({
          id: validation.id,
          status: validation.status,
          confidence: validation.confidence,
          explanation: validation.explanation,
          recommendation: validation.recommendation,
          evidenceRefs: validation.evidenceRefsJson,
          createdAt: validation.createdAt.toISOString(),
        })),
      }
    }),
  }
}

function resultPriority(result: string): number {
  if (result === 'FAIL') return 0
  if (result === 'REVIEW_NEEDED') return 1
  if (result === 'WARN') return 2
  return 3
}
