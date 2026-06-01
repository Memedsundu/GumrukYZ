import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@gumrukyz/db'
import { requireApiUser } from '@/lib/auth'
import { getProcessingProgress } from '@/lib/processing-progress'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const authResult = await requireApiUser()
  if (authResult.response) return authResult.response
  const { user } = authResult

  const submission = await prisma.submission.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      status: true,
      processingJobs: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          currentStep: true,
          errorMessage: true,
          triggerJobId: true,
        },
      },
    },
  })

  if (!submission) {
    return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 })
  }

  const job = submission.processingJobs[0] ?? null
  const progress = getProcessingProgress(submission.status, job?.currentStep ?? null)

  return NextResponse.json({
    submissionId: submission.id,
    status: submission.status,
    progressPercent: progress.percent,
    progressLabel: progress.label,
    progressDescription: progress.description,
    job,
  })
}
