import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@gumrukyz/db'
import { processSubmission } from '@/lib/processing'
import { requireApiUser } from '@/lib/auth'

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

const BLOCKED_PROCESSING_STATUSES = [
  'CLASSIFYING',
  'EXTRACTING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
  'GENERATING_REPORT',
]

const PROCESSABLE_STATUSES = ['UPLOADED', 'COMPLETED', 'FAILED']

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

async function failClaimedJob(submissionId: string, jobId: string, errorMessage: string) {
  await prisma.$transaction([
    prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        currentStep: 'FAILED',
        errorMessage,
        completedAt: new Date(),
      },
    }),
    prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'FAILED' },
    }),
  ]).catch(() => {})
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: submissionId } = await params
    const authResult = await requireApiUser()
    if (authResult.response) return authResult.response
    const { user } = authResult

    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, tenantId: user.tenantId },
      include: {
        documents: {
          include: { latestVersion: true },
        },
      },
    })
    if (!submission) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 })

    if (submission.documents.length === 0) {
      return NextResponse.json({ error: 'Henüz belge yüklenmedi' }, { status: 400 })
    }
    if (submission.tradeFlow !== 'IMPORT' && submission.tradeFlow !== 'EXPORT') {
      return NextResponse.json(
        { error: 'İşleme başlamadan önce ithalat/ihracat yönü doğrulanmalı' },
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
        { error: 'İşleme başlamadan önce belge sınıflandırması doğrulanmalı' },
        { status: 409 },
      )
    }

    if (BLOCKED_PROCESSING_STATUSES.includes(submission.status)) {
      return NextResponse.json({ error: 'İşlem zaten devam ediyor' }, { status: 409 })
    }
    if (!PROCESSABLE_STATUSES.includes(submission.status)) {
      return NextResponse.json(
        { error: `Dosya bu durumdan işlenemez: ${submission.status}` },
        { status: 409 },
      )
    }

    const job = await prisma.$transaction(async (tx) => {
      const claimed = await tx.submission.updateMany({
        where: {
          id: submissionId,
          tenantId: user.tenantId,
          status: { in: PROCESSABLE_STATUSES },
          classificationStatus: 'VALIDATED',
          tradeFlow: { in: ['IMPORT', 'EXPORT'] },
        },
        data: { status: 'CLASSIFYING' },
      })

      if (claimed.count !== 1) return null

      return tx.processingJob.create({
        data: {
          submissionId,
          tenantId: user.tenantId,
          status: 'CLASSIFYING',
          currentStep: 'CLASSIFYING',
          startedAt: new Date(),
        },
      })
    }).catch((claimErr: unknown) => {
      if (isUniqueConstraintError(claimErr)) return null
      throw claimErr
    })

    if (!job) {
      return NextResponse.json({ error: 'İşlem zaten devam ediyor' }, { status: 409 })
    }

    if (isTriggerEnabled()) {
      // Durable background execution via Trigger.dev — survives Vercel timeouts.
      // Dynamic import ensures the SDK is only loaded when TRIGGER_SECRET_KEY is set.
      let handle: { id: string }
      try {
        const { tasks } = await import('@trigger.dev/sdk/v3')
        handle = await tasks.trigger('process-submission', {
          submissionId,
          tenantId: user.tenantId,
          jobId: job.id,
        })
        await prisma.processingJob.update({
          where: { id: job.id },
          data: { triggerJobId: handle.id },
        })
      } catch (triggerErr) {
        const errorMessage = triggerErr instanceof Error
          ? triggerErr.message
          : 'İşleme işi başlatılamadı'
        await failClaimedJob(submissionId, job.id, errorMessage)
        throw triggerErr
      }

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
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
