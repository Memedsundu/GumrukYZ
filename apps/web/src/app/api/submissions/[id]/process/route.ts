import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@gumrukyz/db'
import { processSubmission } from '@/lib/processing'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * True when Trigger.dev is configured — triggers durable background job.
 * False (MVP/local) — runs synchronously inside the request.
 */
function isTriggerEnabled(): boolean {
  return Boolean(process.env['TRIGGER_SECRET_KEY'])
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, tenantId: user.tenantId },
      include: {
        documents: {
          include: { latestVersion: true },
        },
      },
    })
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    if (submission.documents.length === 0) {
      return NextResponse.json({ error: 'No documents uploaded yet' }, { status: 400 })
    }
    if (submission.tradeFlow !== 'IMPORT' && submission.tradeFlow !== 'EXPORT') {
      return NextResponse.json(
        { error: 'Import/export direction must be validated before processing' },
        { status: 409 },
      )
    }

    const unvalidatedDocuments = submission.documents.filter(
      (document) =>
        !document.isIgnored &&
        (document.docType === 'UNCLASSIFIED' || !document.classificationValidatedAt),
    )
    if (unvalidatedDocuments.length > 0 || submission.classificationStatus !== 'VALIDATED') {
      return NextResponse.json(
        { error: 'Document classification must be validated before processing' },
        { status: 409 },
      )
    }

    const blockedStatuses = ['CLASSIFYING', 'EXTRACTING', 'NORMALIZING', 'RUNNING_RULES', 'GENERATING_REPORT']
    if (blockedStatuses.includes(submission.status)) {
      return NextResponse.json({ error: 'Processing already in progress' }, { status: 409 })
    }

    // Create processing job record
    const job = await prisma.processingJob.create({
      data: {
        submissionId,
        tenantId: user.tenantId,
        status: 'CLASSIFYING',
        currentStep: 'CLASSIFYING',
        startedAt: new Date(),
      },
    })

    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'CLASSIFYING' },
    })

    if (isTriggerEnabled()) {
      // Durable background execution via Trigger.dev — survives Vercel timeouts.
      // Dynamic import ensures the SDK is only loaded when TRIGGER_SECRET_KEY is set.
      const { tasks } = await import('@trigger.dev/sdk/v3')
      const handle = await tasks.trigger('process-submission', {
        submissionId,
        tenantId: user.tenantId,
        jobId: job.id,
      })

      return NextResponse.json(
        { jobId: job.id, triggerRunId: handle.id, async: true },
        { status: 202 },
      )
    }

    // MVP fallback: synchronous in-process execution.
    // Replace with Trigger.dev once TRIGGER_SECRET_KEY is configured.
    await processSubmission(submissionId, user.tenantId, job.id)

    const finalJob = await prisma.processingJob.findUnique({
      where: { id: job.id },
      select: { id: true, status: true, currentStep: true, errorMessage: true },
    })

    return NextResponse.json(
      {
        jobId: job.id,
        status: finalJob?.status ?? 'UNKNOWN',
        currentStep: finalJob?.currentStep ?? null,
        errorMessage: finalJob?.errorMessage ?? null,
      },
      { status: finalJob?.status === 'FAILED' ? 500 : 200 },
    )
  } catch (err) {
    console.error('POST /api/submissions/[id]/process error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
