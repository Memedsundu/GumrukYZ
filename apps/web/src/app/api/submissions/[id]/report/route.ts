import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@gumrukyz/db'
import { buildReportPayload } from '@/lib/report-data'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const payload = await buildReportPayload(submissionId, user.tenantId)
    if (!payload) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

    return NextResponse.json(payload)
  } catch (err) {
    console.error('GET /api/submissions/[id]/report error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
