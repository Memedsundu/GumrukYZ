import { prisma, Prisma } from '@gumrukyz/db'
import { getTenantEntitlements } from './entitlements'

// Expert-review quota is metered as a monthly entitlement (Phase 2). This module
// keeps the concurrency lock + "reuse existing completed review" short-circuit;
// the credit itself is reserved/consumed/refunded via the entitlement service.

const STALE_RUNNING_REVIEW_MS = 15 * 60 * 1000

export type ExpertReviewQuota = {
  limit: number
  used: number
  remaining: number
  usedOn: string
  period: 'MONTHLY'
}

export type ExpertReviewReservation =
  | { kind: 'existing'; reviewId: string }
  | { kind: 'reserved'; reviewId: string }

export class ExpertReviewAlreadyRunningError extends Error {
  constructor() {
    super('Bu dosya için Uzman İncelemesi zaten devam ediyor')
    this.name = 'ExpertReviewAlreadyRunningError'
  }
}

export async function getExpertReviewQuota(tenantId: string): Promise<ExpertReviewQuota> {
  const entitlement = await getTenantEntitlements(tenantId)
  const metric = entitlement.metrics.expertReview
  return {
    limit: metric.limit,
    used: metric.used,
    remaining: metric.remaining,
    usedOn: entitlement.resetDate ?? '',
    period: 'MONTHLY',
  }
}

/**
 * Reserve a slot to run an expert review: reuse an already-completed review for
 * the same report (no charge), otherwise create a RUNNING review row. The unique
 * "one running review per submission" index enforces concurrency. Quota is
 * charged separately by the caller via the entitlement service.
 */
export async function reserveExpertReviewSlot(params: {
  tenantId: string
  submissionId: string
  processingJobId?: string | null
  forceNew?: boolean
}): Promise<ExpertReviewReservation> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.expertReview.updateMany({
        where: {
          tenantId: params.tenantId,
          submissionId: params.submissionId,
          status: 'RUNNING',
          createdAt: { lt: new Date(Date.now() - STALE_RUNNING_REVIEW_MS) },
        },
        data: {
          status: 'ERROR',
          summary: 'Önceki Uzman İncelemesi zaman aşımına uğradı. Yeniden başlatabilirsiniz.',
          completedAt: new Date(),
        },
      })

      if (!params.forceNew) {
        const existingReview = await tx.expertReview.findFirst({
          where: {
            tenantId: params.tenantId,
            submissionId: params.submissionId,
            processingJobId: params.processingJobId ?? null,
            status: 'COMPLETED',
            supersededAt: null,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })

        if (existingReview) {
          return { kind: 'existing', reviewId: existingReview.id }
        }
      }

      const review = await tx.expertReview.create({
        data: {
          tenantId: params.tenantId,
          submissionId: params.submissionId,
          processingJobId: params.processingJobId ?? null,
          status: 'RUNNING',
          legalContextStatus: 'NOT_RUN',
          summary: 'Uzman İncelemesi hazırlanıyor.',
        },
        select: { id: true },
      })

      return { kind: 'reserved', reviewId: review.id }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ExpertReviewAlreadyRunningError()
    }
    throw error
  }
}
