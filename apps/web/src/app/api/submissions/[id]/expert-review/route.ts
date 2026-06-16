import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@gumrukyz/db'
import type { DocumentType } from '@gumrukyz/domain'
import type { ExtractionData } from '@gumrukyz/rules'
import { requireApiUser } from '@/lib/auth'
import { runExpertReviewForSubmission } from '@/lib/expert-review'
import { UsageMetric } from '@gumrukyz/domain'
import {
  ExpertReviewAlreadyRunningError,
  getExpertReviewQuota,
  reserveExpertReviewSlot,
} from '@/lib/expert-review-quota'
import {
  consumeMetric,
  EntitlementExhaustedError,
  getEntitlementBlock,
  getEntitlementsState,
  refundMetric,
  reserveMetric,
} from '@/lib/entitlements'
import { entitlementError } from '@/lib/api-errors'

interface Params {
  params: Promise<{ id: string }>
}

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: Params) {
  const { id: submissionId } = await params
  const authResult = await requireApiUser()
  if (authResult.response) return authResult.response
  const { user } = authResult

  let reservedReviewId: string | null = null
  let creditReserved = false

  try {
    const block = await getEntitlementBlock(user.tenantId)
    if (block) return entitlementError(block)

    const body = await req.json().catch(() => ({})) as { force?: unknown }
    const forceNew = body.force === true
    const input = await loadExpertReviewInput(submissionId, user.tenantId)
    if (!input) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 })
    }
    if (input.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Uzman İncelemesi için önce dosya analizinin tamamlanması gerekiyor' },
        { status: 409 },
      )
    }

    const reservation = await reserveExpertReviewSlot({
      tenantId: user.tenantId,
      submissionId,
      processingJobId: input.currentReportJobId,
      forceNew,
    })

    if (reservation.kind === 'existing') {
      return NextResponse.json({
        expertReview: await getExpertReviewSummary(reservation.reviewId, user.tenantId),
        quota: await getExpertReviewQuota(user.tenantId),
        consumed: false,
        message: 'Uzman İncelemesi daha önce tamamlandı.',
      })
    }

    reservedReviewId = reservation.reviewId

    // Reserve the monthly expert-review credit; release the running row on exhaustion.
    try {
      await reserveMetric({
        tenantId: user.tenantId,
        metric: UsageMetric.EXPERT_REVIEW,
        expertReviewId: reservation.reviewId,
      })
      creditReserved = true
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
        return NextResponse.json(
          {
            error: 'Uzman İncelemesi hakkınız kalmadı',
            code: 'ENTITLEMENT_EXHAUSTED',
            quota: await getExpertReviewQuota(user.tenantId),
            entitlement: await getEntitlementsState(user.tenantId),
          },
          { status: 429 },
        )
      }
      throw creditErr
    }

    const expertReview = await runExpertReviewForSubmission({
      submissionId,
      tenantId: user.tenantId,
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

    return NextResponse.json({
      expertReview,
      quota: await getExpertReviewQuota(user.tenantId),
      consumed,
    })
  } catch (error) {
    if (error instanceof ExpertReviewAlreadyRunningError) {
      return NextResponse.json(
        { error: 'Bu dosya için Uzman İncelemesi zaten devam ediyor' },
        { status: 409 },
      )
    }

    if (reservedReviewId) {
      await Promise.all([
        creditReserved
          ? refundMetric({
              metric: UsageMetric.EXPERT_REVIEW,
              expertReviewId: reservedReviewId,
              reason: 'review_error',
            })
          : Promise.resolve(),
        prisma.expertReview.update({
          where: { id: reservedReviewId },
          data: {
            status: 'ERROR',
            summary: 'Uzman İncelemesi tamamlanamadı. Lütfen daha sonra tekrar deneyin.',
            completedAt: new Date(),
          },
        }).catch(() => null),
      ])
    }

    console.error('POST /api/submissions/[id]/expert-review error:', error)
    return NextResponse.json({ error: 'Uzman İncelemesi başlatılamadı' }, { status: 500 })
  }
}

async function loadExpertReviewInput(submissionId: string, tenantId: string) {
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

async function getExpertReviewSummary(reviewId: string, tenantId: string) {
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

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
