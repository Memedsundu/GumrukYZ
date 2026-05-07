import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@gumrukyz/db'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const report = await prisma.riskReport.findFirst({
      where: { submissionId, tenantId: user.tenantId },
      orderBy: { generatedAt: 'desc' },
    })

    const ruleResults = await prisma.ruleResult.findMany({
      where: { submissionId, tenantId: user.tenantId },
      orderBy: [{ severity: 'asc' }, { ruleCode: 'asc' }],
    })

    return NextResponse.json({ report, ruleResults })
  } catch (err) {
    console.error('GET /api/submissions/[id]/report error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
