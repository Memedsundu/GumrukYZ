import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300
import { requireApiUser } from '@/lib/auth'
import { startSubmissionProcessing } from '@/lib/processing-runner'
import { getEntitlementBlock } from '@/lib/entitlements'
import { entitlementError } from '@/lib/api-errors'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    // Reanalysis of an already-analyzed submission stays free during trial; the
    // block only fires once the trial is fully exhausted (time or first-run cap).
    const block = await getEntitlementBlock(user.tenantId)
    if (block) return entitlementError(block)

    const result = await startSubmissionProcessing({ submissionId, tenantId: user.tenantId })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.code ? { code: result.code } : {}) },
        { status: result.status },
      )
    }

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
