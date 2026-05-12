import { prisma } from '@gumrukyz/db'
import {
  formatRuleResultMessage,
  formatSourceRef,
  parseSourceRefs,
  resultLabel,
  severityLabel,
} from './report-format'

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
        include: { overrides: { orderBy: { createdAt: 'desc' } } },
      },
    },
  })

  if (!submission) return null

  const report = submission.riskReports[0]
  if (!report) return null

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
      summaryText: report.summaryText,
      totalErrors: report.totalErrors,
      totalWarnings: report.totalWarnings,
      totalReviewNeeded: report.totalReviewNeeded,
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
      warnings: submission.ruleResults.filter((result) => result.result === 'WARN').length,
      reviewNeeded: submission.ruleResults.filter((result) => result.result === 'REVIEW_NEEDED').length,
      passes: submission.ruleResults.filter((result) => result.result === 'PASS').length,
    },
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
        sourceRefs,
        sourceRefsDisplay: sourceRefs.map(formatSourceRef),
        createdAt: result.createdAt.toISOString(),
        overrides: result.overrides.map((override) => ({
          id: override.id,
          originalResult: override.originalResult,
          newResult: override.newResult,
          reason: override.reason,
          createdAt: override.createdAt.toISOString(),
        })),
      }
    }),
  }
}
