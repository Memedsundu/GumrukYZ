import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@gumrukyz/db'
import { z } from 'zod'

const CreateSubmissionSchema = z.object({
  title: z.string().min(1).max(200),
  tradeFlow: z.enum(['IMPORT', 'EXPORT']),
  dataClassification: z.enum(['SYNTHETIC', 'REDACTED', 'REAL']).default('SYNTHETIC'),
})

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      include: { tenant: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await req.json() as unknown
    const parsed = CreateSubmissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    if (!user.tenant.dataClassificationAllowed.includes(parsed.data.dataClassification)) {
      return NextResponse.json(
        {
          error: `Data classification ${parsed.data.dataClassification} is not allowed for this tenant`,
        },
        { status: 403 },
      )
    }

    const submission = await prisma.submission.create({
      data: {
        tenantId: user.tenantId,
        createdBy: user.id,
        title: parsed.data.title,
        tradeFlow: parsed.data.tradeFlow,
        dataClassification: parsed.data.dataClassification,
        status: 'PENDING',
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'submission.created',
        entityType: 'Submission',
        entityId: submission.id,
        afterJson: { title: submission.title, tradeFlow: submission.tradeFlow },
      },
    })

    return NextResponse.json(submission, { status: 201 })
  } catch (err) {
    console.error('POST /api/submissions error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const submissions = await prisma.submission.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: { select: { documents: true } },
      },
    })

    return NextResponse.json(submissions)
  } catch (err) {
    console.error('GET /api/submissions error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
