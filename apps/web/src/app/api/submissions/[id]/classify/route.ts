import { NextResponse } from 'next/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { requireApiUser } from '@/lib/auth'
import { startSubmissionClassification } from '@/lib/classification-runner'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const result = await startSubmissionClassification({
      submissionId,
      tenantId: user.tenantId,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.code ? { code: result.code } : {}) },
        { status: result.status },
      )
    }

    if (result.async) {
      return NextResponse.json(
        {
          async: true,
          classificationStatus: result.classificationStatus,
          triggerRunId: result.triggerRunId,
        },
        { status: 202 },
      )
    }

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'submission.classified',
        entityType: 'Submission',
        entityId: submissionId,
        afterJson: result.result as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json(result.result)
  } catch (err) {
    console.error('POST /api/submissions/[id]/classify error:', err)
    return NextResponse.json({ error: 'Sınıflandırma başarısız' }, { status: 500 })
  }
}
