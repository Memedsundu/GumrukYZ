import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { classifySubmissionDocuments } from '@/lib/classification'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const result = await classifySubmissionDocuments({
      submissionId,
      tenantId: user.tenantId,
    })

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'submission.classified',
        entityType: 'Submission',
        entityId: submissionId,
        afterJson: result as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Classification failed'
    const status = message === 'Submission not found' ? 404 : message === 'No documents uploaded yet' ? 400 : 500
    console.error('POST /api/submissions/[id]/classify error:', err)
    return NextResponse.json({ error: message }, { status })
  }
}
