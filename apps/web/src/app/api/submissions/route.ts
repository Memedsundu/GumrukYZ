import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@gumrukyz/db'
import { DataClassification } from '@gumrukyz/domain'
import { z } from 'zod'
import { requireApiUser } from '@/lib/auth'
import { PILOT_DEFAULT_DATA_CLASSIFICATION } from '@/lib/pilot'

const CreateSubmissionSchema = z.object({
  title: z.string().min(1).max(200),
  dataClassification: z
    .enum([
      DataClassification.SYNTHETIC,
      DataClassification.REDACTED,
      DataClassification.REAL,
    ])
    .optional(),
}).strict()

const DEFAULT_TRADE_FLOW = 'UNKNOWN'

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const body = await req.json() as unknown
    const parsed = CreateSubmissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçerli bir referans adı girin' }, { status: 400 })
    }

    const dataClassification =
      parsed.data.dataClassification ?? PILOT_DEFAULT_DATA_CLASSIFICATION

    if (!user.tenant.dataClassificationAllowed.includes(dataClassification)) {
      return NextResponse.json(
        { error: 'Bu veri sınıflandırması bu organizasyon için izinli değil' },
        { status: 403 },
      )
    }

    const submission = await prisma.submission.create({
      data: {
        tenantId: user.tenantId,
        createdBy: user.id,
        title: parsed.data.title,
        tradeFlow: DEFAULT_TRADE_FLOW,
        dataClassification,
        status: 'PENDING',
        classificationStatus: 'PENDING',
        classificationValidatedAt: null,
        classificationValidatedBy: null,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'submission.created',
        entityType: 'Submission',
        entityId: submission.id,
        afterJson: {
          title: submission.title,
          tradeFlow: submission.tradeFlow,
          dataClassification: submission.dataClassification,
        },
      },
    })

    return NextResponse.json(submission, { status: 201 })
  } catch (err) {
    console.error('POST /api/submissions error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

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
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
