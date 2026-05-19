import { NextRequest, NextResponse } from 'next/server'
import { buildReportPayload } from '@/lib/report-data'
import { requireApiUser } from '@/lib/auth'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const payload = await buildReportPayload(submissionId, user.tenantId)
    if (!payload) return NextResponse.json({ error: 'Rapor bulunamadı' }, { status: 404 })

    return NextResponse.json(payload)
  } catch (err) {
    console.error('GET /api/submissions/[id]/report error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
