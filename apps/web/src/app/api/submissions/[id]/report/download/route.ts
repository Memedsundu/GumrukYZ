import { NextRequest, NextResponse } from 'next/server'
import { buildReportPayload } from '@/lib/report-data'
import { renderReportPdf } from '@/lib/report-pdf'
import { reportFilename } from '@/lib/report-format'
import { requireApiUser } from '@/lib/auth'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const format = req.nextUrl.searchParams.get('format') ?? 'pdf'

    if (format !== 'pdf' && format !== 'json') {
      return NextResponse.json({ error: 'Desteklenmeyen format' }, { status: 400 })
    }

    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const payload = await buildReportPayload(submissionId, user.tenantId)
    if (!payload) return NextResponse.json({ error: 'Rapor bulunamadı' }, { status: 404 })

    const filename = reportFilename(payload.submission.title, format)
    const disposition = `attachment; filename="${filename}"`

    if (format === 'json') {
      return new NextResponse(JSON.stringify(payload, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': disposition,
        },
      })
    }

    const pdf = await renderReportPdf(payload)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
      },
    })
  } catch (err) {
    console.error('GET /api/submissions/[id]/report/download error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
