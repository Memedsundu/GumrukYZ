import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@gumrukyz/db'
import { buildReportPayload } from '@/lib/report-data'
import { renderReportPdf } from '@/lib/report-pdf'
import { reportFilename } from '@/lib/report-format'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const format = req.nextUrl.searchParams.get('format') ?? 'pdf'

    if (format !== 'pdf' && format !== 'json') {
      return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
    }

    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const payload = await buildReportPayload(submissionId, user.tenantId)
    if (!payload) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
