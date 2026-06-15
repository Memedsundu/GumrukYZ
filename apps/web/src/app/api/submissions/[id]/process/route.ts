import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { startSubmissionProcessing } from '@/lib/processing-runner'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const result = await startSubmissionProcessing({ submissionId, tenantId: user.tenantId })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json(
      {
        jobId: result.jobId,
        triggerRunId: result.triggerRunId,
        async: result.async,
        status: result.status,
        currentStep: result.currentStep,
        errorMessage: result.errorMessage,
      },
      { status: result.async ? 202 : result.status === 'FAILED' ? 500 : 200 },
    )
  } catch (err) {
    console.error('POST /api/submissions/[id]/process error:', err)
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
