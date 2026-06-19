import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@gumrukyz/db'
import { requireApiUser } from '@/lib/auth'
import {
  ExpertReviewAlreadyRunningError,
  getExpertReviewSummary,
  startExpertReview,
} from '@/lib/expert-review-runner'
import { getExpertReviewQuota } from '@/lib/expert-review-quota'

interface Params {
  params: Promise<{ id: string }>
}

export const maxDuration = 300

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: submissionId } = await params
  const authResult = await requireApiUser()
  if (authResult.response) return authResult.response
  const { user } = authResult

  const review = await prisma.expertReview.findFirst({
    where: { submissionId, tenantId: user.tenantId, supersededAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  })

  if (!review) {
    return NextResponse.json({ expertReview: null, running: false })
  }

  const summary = await getExpertReviewSummary(review.id, user.tenantId)
  return NextResponse.json({
    expertReview: summary,
    running: review.status === 'RUNNING' || review.status === 'PENDING',
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: submissionId } = await params
  const authResult = await requireApiUser()
  if (authResult.response) return authResult.response
  const { user } = authResult

  try {
    const body = await req.json().catch(() => ({})) as { force?: unknown }
    const result = await startExpertReview({
      tenantId: user.tenantId,
      submissionId,
      forceNew: body.force === true,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.code ? { code: result.code } : {}),
          ...(result.quota ? { quota: result.quota } : {}),
          ...(result.entitlement ? { entitlement: result.entitlement } : {}),
        },
        { status: result.status },
      )
    }

    if (result.kind === 'existing') {
      revalidatePath(`/submissions/${submissionId}/report`)
      return NextResponse.json({
        expertReview: result.expertReview,
        quota: result.quota,
        consumed: result.consumed,
        message: result.message,
      })
    }

    if (result.async) {
      return NextResponse.json(
        {
          async: true,
          reviewId: result.reviewId,
          triggerRunId: result.triggerRunId,
          quota: result.quota,
        },
        { status: 202 },
      )
    }

    revalidatePath(`/submissions/${submissionId}/report`)
    return NextResponse.json({
      expertReview: result.expertReview,
      quota: result.quota,
      consumed: result.consumed,
    })
  } catch (error) {
    if (error instanceof ExpertReviewAlreadyRunningError) {
      return NextResponse.json(
        { error: 'Bu dosya için Uzman İncelemesi zaten devam ediyor' },
        { status: 409 },
      )
    }

    console.error('POST /api/submissions/[id]/expert-review error:', error)
    return NextResponse.json({ error: 'Uzman İncelemesi başlatılamadı' }, { status: 500 })
  }
}
