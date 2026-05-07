import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@gumrukyz/db'
import { processSubmission } from '@/lib/processing'

interface Params {
  params: Promise<{ id: string }>
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

    // Run processing synchronously for MVP (no separate queue service yet).
    // Trigger.dev will replace this in Sprint 2.
    // For now: run in background via a non-blocking call.
    processSubmission(submissionId, user.tenantId, job.id).catch((err) => {
      console.error('Background processing error:', err)
    })

    return NextResponse.json({ jobId: job.id, status: 'started' }, { status: 202 })
  } catch (err) {
    console.error('POST /api/submissions/[id]/process error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
