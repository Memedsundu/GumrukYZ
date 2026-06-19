import { prisma, Prisma } from '@gumrukyz/db'
import type { DocumentType } from '@gumrukyz/domain'
import type { ExtractionData } from '@gumrukyz/rules'
import { UsageMetric } from '@gumrukyz/domain'
import { runExpertReviewForSubmission } from './expert-review'
import {
  ExpertReviewAlreadyRunningError,
  getExpertReviewQuota,
  reserveExpertReviewSlot,
  type ExpertReviewQuota,
} from './expert-review-quota'
import {
  consumeMetric,
  EntitlementExhaustedError,
  getEntitlementsState,
  refundMetric,
  reserveMetric,
} from './entitlements'
import { allowsSyncProcessingFallback, isAsyncProcessingRequired } from './runtime-env'
import { checkSpendAllowed } from './spend-guard'
import './spend-guard-init'

export type ExpertReviewSummaryResponse = {
  id: string
  status: string
  legalContextStatus: string
  overallRisk: string | null
  summary: string | null
  warningCount: number
  reviewNeededCount: number
  findings: Array<{
    area: string
    severity: string
    title: string
    explanation: string
  }>
}

export type StartExpertReviewResult =
  | {
      ok: true
      kind: 'existing'
      expertReview: ExpertReviewSummaryResponse | null
      quota: ExpertReviewQuota
      consumed: false
      message: string
    }
  | {
      ok: true
      kind: 'started'
      async: true
      reviewId: string
      triggerRunId: string
      quota: ExpertReviewQuota
    }
  | {
      ok: true
      kind: 'started'
      async: false
      expertReview: ExpertReviewSummaryResponse | null
      quota: ExpertReviewQuota
      consumed: boolean
    }
  | {
      ok: false
      status: number
      error: string
      code?: string
      quota?: ExpertReviewQuota
      entitlement?: Awaited<ReturnType<typeof getEntitlementsState>>
    }

export async function loadExpertReviewInput(submissionId: string, tenantId: string) {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, tenantId },
    select: {
      id: true,
      status: true,
      currentReportJobId: true,
      tradeFlow: true,
      documents: {
        orderBy: { createdAt: 'asc' },
        include: {
          latestVersion: {
            include: {
              extractions: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      },
      ruleResults: {
        orderBy: [{ severity: 'asc' }, { ruleCode: 'asc' }],
        select: {
          processingJobId: true,
          ruleCode: true,
          severity: true,
          result: true,
          message: true,
          sourceRefsJson: true,
        },
      },
    },
  })

  if (!submission) return null

  return {
    status: submission.status,
    currentReportJobId: submission.currentReportJobId,
    tradeFlow: submission.tradeFlow,
    documents: submission.documents
      .filter((document) => !document.isIgnored && document.docType !== 'UNCLASSIFIED')
      .map((document): ExtractionData => {
        const extraction = document.latestVersion?.extractions[0] ?? null
        return {
          docType: document.docType as DocumentType,
          data: jsonRecord(extraction?.structuredJson ?? null),
          confidence: typeof extraction?.confidence === 'number' ? extraction.confidence : 0,
        }
      }),
    ruleResults: submission.ruleResults.filter((result) => (
      submission.currentReportJobId
        ? result.processingJobId === submission.currentReportJobId
        : result.processingJobId === null
    )),
  }
}

export async function getExpertReviewSummary(
  reviewId: string,
  tenantId: string,
): Promise<ExpertReviewSummaryResponse | null> {
  const review = await prisma.expertReview.findFirst({
    where: { id: reviewId, tenantId },
    include: {
      findings: {
        orderBy: { createdAt: 'asc' },
        select: {
          area: true,
          severity: true,
          title: true,
          explanation: true,
        },
      },
    },
  })

  if (!review) return null

  return {
    id: review.id,
    status: review.status,
    legalContextStatus: review.legalContextStatus,
    overallRisk: review.overallRisk,
    summary: review.summary,
    warningCount: review.findings.filter((finding) => finding.severity === 'WARN').length,
    reviewNeededCount: review.findings.filter((finding) => finding.severity === 'REVIEW_NEEDED').length,
    findings: review.findings,
  }
}

export async function startExpertReview(params: {
  tenantId: string
  submissionId: string
  forceNew?: boolean
}): Promise<StartExpertReviewResult> {
  const input = await loadExpertReviewInput(params.submissionId, params.tenantId)
  if (!input) {
    return { ok: false, status: 404, error: 'Dosya bulunamadı' }
  }
  if (input.status !== 'COMPLETED') {
    return {
      ok: false,
      status: 409,
      error: 'Uzman İncelemesi için önce dosya analizinin tamamlanması gerekiyor',
    }
  }

  const spend = await checkSpendAllowed(params.tenantId)
  if (!spend.ok) {
    return {
      ok: false,
      status: spend.status,
      error: spend.error,
      code: spend.code,
    }
  }

  const reservation = await reserveExpertReviewSlot({
    tenantId: params.tenantId,
    submissionId: params.submissionId,
    processingJobId: input.currentReportJobId,
    forceNew: params.forceNew,
  })

  if (reservation.kind === 'existing') {
    return {
      ok: true,
      kind: 'existing',
      expertReview: await getExpertReviewSummary(reservation.reviewId, params.tenantId),
      quota: await getExpertReviewQuota(params.tenantId),
      consumed: false,
      message: 'Uzman İncelemesi daha önce tamamlandı.',
    }
  }

  try {
    await reserveMetric({
      tenantId: params.tenantId,
      metric: UsageMetric.EXPERT_REVIEW,
      expertReviewId: reservation.reviewId,
    })
  } catch (creditErr) {
    if (creditErr instanceof EntitlementExhaustedError) {
      await prisma.expertReview
        .update({
          where: { id: reservation.reviewId },
          data: {
            status: 'ERROR',
            summary: 'Uzman İncelemesi hakkınız kalmadı.',
            completedAt: new Date(),
          },
        })
        .catch(() => null)
      return {
        ok: false,
        status: 429,
        error: 'Uzman İncelemesi hakkınız kalmadı',
        code: 'ENTITLEMENT_EXHAUSTED',
        quota: await getExpertReviewQuota(params.tenantId),
        entitlement: await getEntitlementsState(params.tenantId),
      }
    }
    throw creditErr
  }

  if (isAsyncProcessingRequired() && !isTriggerEnabled()) {
    await failExpertReviewReservation(reservation.reviewId, params.tenantId, true)
    return {
      ok: false,
      status: 503,
      error: 'Arka plan Uzman İncelemesi şu an kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
      code: 'EXPERT_REVIEW_UNAVAILABLE',
    }
  }

  if (isTriggerEnabled()) {
    try {
      const { tasks } = await import('@trigger.dev/sdk')
      const handle = await tasks.trigger(
        'expert-review',
        {
          submissionId: params.submissionId,
          tenantId: params.tenantId,
          reviewId: reservation.reviewId,
          processingJobId: input.currentReportJobId,
        },
        {
          queue: 'expert-review',
          concurrencyKey: params.tenantId,
        },
      )
      return {
        ok: true,
        kind: 'started',
        async: true,
        reviewId: reservation.reviewId,
        triggerRunId: handle.id,
        quota: await getExpertReviewQuota(params.tenantId),
      }
    } catch (err) {
      await failExpertReviewReservation(
        reservation.reviewId,
        params.tenantId,
        true,
        err instanceof Error ? err.message : 'Uzman İncelemesi başlatılamadı',
      )
      throw err
    }
  }

  if (!allowsSyncProcessingFallback()) {
    await failExpertReviewReservation(reservation.reviewId, params.tenantId, true)
    return {
      ok: false,
      status: 503,
      error: 'Uzman İncelemesi başlatılamadı',
      code: 'EXPERT_REVIEW_UNAVAILABLE',
    }
  }

  try {
    const expertReview = await runExpertReviewForSubmission({
      submissionId: params.submissionId,
      tenantId: params.tenantId,
      reviewId: reservation.reviewId,
      processingJobId: input.currentReportJobId,
      tradeFlow: input.tradeFlow,
      documents: input.documents,
      ruleResults: input.ruleResults,
    })

    const consumed = expertReview?.status === 'COMPLETED'
    if (consumed) {
      await consumeMetric({
        metric: UsageMetric.EXPERT_REVIEW,
        expertReviewId: reservation.reviewId,
      })
    } else {
      await refundMetric({
        metric: UsageMetric.EXPERT_REVIEW,
        expertReviewId: reservation.reviewId,
        reason: 'review_not_completed',
      })
    }

    return {
      ok: true,
      kind: 'started',
      async: false,
      expertReview: expertReview
        ? await getExpertReviewSummary(reservation.reviewId, params.tenantId)
        : null,
      quota: await getExpertReviewQuota(params.tenantId),
      consumed,
    }
  } catch (err) {
    await failExpertReviewReservation(
      reservation.reviewId,
      params.tenantId,
      true,
      err instanceof Error ? err.message : 'Uzman İncelemesi tamamlanamadı',
    )
    throw err
  }
}

export async function finalizeExpertReviewRun(params: {
  tenantId: string
  submissionId: string
  reviewId: string
  processingJobId?: string | null
}): Promise<ExpertReviewSummaryResponse | null> {
  // Idempotency guard for Trigger at-least-once delivery: if this review already
  // reached a terminal-success state, do not re-run (which would re-call OpenAI and
  // append a second set of findings). ERROR is intentionally excluded so genuine
  // task retries can re-attempt a transient failure.
  const existing = await prisma.expertReview.findFirst({
    where: { id: params.reviewId, tenantId: params.tenantId },
    select: { status: true },
  })
  if (
    existing &&
    (existing.status === 'COMPLETED' ||
      existing.status === 'SKIPPED' ||
      existing.status === 'LEGAL_CONTEXT_INCOMPLETE')
  ) {
    return getExpertReviewSummary(params.reviewId, params.tenantId)
  }

  const input = await loadExpertReviewInput(params.submissionId, params.tenantId)
  if (!input) {
    await failExpertReviewReservation(params.reviewId, params.tenantId, true)
    return null
  }

  try {
    const expertReview = await runExpertReviewForSubmission({
      submissionId: params.submissionId,
      tenantId: params.tenantId,
      reviewId: params.reviewId,
      processingJobId: params.processingJobId ?? input.currentReportJobId,
      tradeFlow: input.tradeFlow,
      documents: input.documents,
      ruleResults: input.ruleResults,
    })

    const consumed = expertReview?.status === 'COMPLETED'
    if (consumed) {
      await consumeMetric({
        metric: UsageMetric.EXPERT_REVIEW,
        expertReviewId: params.reviewId,
      })
    } else {
      await refundMetric({
        metric: UsageMetric.EXPERT_REVIEW,
        expertReviewId: params.reviewId,
        reason: 'review_not_completed',
      })
    }

    return getExpertReviewSummary(params.reviewId, params.tenantId)
  } catch (err) {
    await failExpertReviewReservation(
      params.reviewId,
      params.tenantId,
      true,
      err instanceof Error ? err.message : 'Uzman İncelemesi tamamlanamadı',
    )
    throw err
  }
}

async function failExpertReviewReservation(
  reviewId: string,
  tenantId: string,
  refundCredit: boolean,
  errorMessage = 'Uzman İncelemesi tamamlanamadı. Lütfen daha sonra tekrar deneyin.',
) {
  await Promise.all([
    refundCredit
      ? refundMetric({
          metric: UsageMetric.EXPERT_REVIEW,
          expertReviewId: reviewId,
          reason: 'review_error',
        }).catch(() => {})
      : Promise.resolve(),
    prisma.expertReview.update({
      where: { id: reviewId },
      data: {
        status: 'ERROR',
        summary: errorMessage,
        completedAt: new Date(),
      },
    }).catch(() => null),
  ])
}

function isTriggerEnabled(): boolean {
  return Boolean(process.env['TRIGGER_SECRET_KEY'])
}

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export { ExpertReviewAlreadyRunningError }
