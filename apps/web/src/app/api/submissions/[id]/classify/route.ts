import { NextResponse } from 'next/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { classifySubmissionDocuments } from '@/lib/classification'
import { requireApiUser } from '@/lib/auth'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

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
    const localizedMessage =
      message === 'Submission not found'
        ? 'Dosya bulunamadı'
        : message === 'No documents uploaded yet'
          ? 'Henüz belge yüklenmedi'
          : 'Sınıflandırma başarısız'
    console.error('POST /api/submissions/[id]/classify error:', err)
    return NextResponse.json({ error: localizedMessage }, { status })
  }
}
