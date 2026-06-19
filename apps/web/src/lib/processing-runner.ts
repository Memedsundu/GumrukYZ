import { prisma, Prisma } from '@gumrukyz/db'
import { UsageMetric } from '@gumrukyz/domain'
import { processSubmission } from './processing'
import { EntitlementExhaustedError, reserveAnalysisCredit, refundMetric } from './entitlements'
import { allowsSyncProcessingFallback, isAsyncProcessingRequired } from './runtime-env'
import { checkSpendAllowed } from './spend-guard'
import './spend-guard-init'
import { submissionProcessingQueue } from '@/trigger/queues'

const BLOCKED_PROCESSING_STATUSES = [
  'CLASSIFYING',
  'EXTRACTING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
  'GENERATING_REPORT',
]

const PROCESSABLE_STATUSES = ['UPLOADED', 'COMPLETED', 'FAILED']

export type StartProcessingResult =
  | {
      ok: true
      jobId: string
      status: string
      currentStep: string | null
      errorMessage: string | null
      async: boolean
      triggerRunId?: string
    }
  | {
      ok: false
      status: number
      error: string
      code?: string
    }

export async function startSubmissionProcessing(params: {
  submissionId: string
  tenantId: string
}): Promise<StartProcessingResult> {
  const { submissionId, tenantId } = params

  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, tenantId },
    include: {
      documents: {
        include: { latestVersion: true },
      },
    },
  })
  if (!submission) return { ok: false, status: 404, error: 'Dosya bulunamadı' }

  if (submission.documents.length === 0) {
    return { ok: false, status: 400, error: 'Henüz belge yüklenmedi' }
  }
  if (submission.tradeFlow !== 'IMPORT' && submission.tradeFlow !== 'EXPORT') {
    return { ok: false, status: 409, error: 'İşleme başlamadan önce ithalat/ihracat yönü doğrulanmalı' }
  }

  const unvalidatedDocuments = submission.documents.filter(
    (document) =>
      !document.isIgnored &&
      (document.docType === 'UNCLASSIFIED' || !document.classificationValidatedAt),
  )
  if (unvalidatedDocuments.length > 0 || submission.classificationStatus !== 'VALIDATED') {
    return { ok: false, status: 409, error: 'İşleme başlamadan önce belge sınıflandırması doğrulanmalı' }
  }

  if (BLOCKED_PROCESSING_STATUSES.includes(submission.status)) {
    return { ok: false, status: 409, error: 'İşlem zaten devam ediyor' }
  }
  if (!PROCESSABLE_STATUSES.includes(submission.status)) {
    return { ok: false, status: 409, error: `Dosya bu durumdan işlenemez: ${submission.status}` }
  }

  const spend = await checkSpendAllowed(tenantId)
  if (!spend.ok) {
    return {
      ok: false,
      status: spend.status,
      error: spend.error,
      code: spend.code,
    }
  }

  if (isAsyncProcessingRequired() && !isTriggerEnabled()) {
    return {
      ok: false,
      status: 503,
      error: 'Arka plan işleme şu an kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
      code: 'PROCESSING_UNAVAILABLE',
    }
  }

  const job = await prisma.$transaction(async (tx) => {
    const claimed = await tx.submission.updateMany({
      where: {
        id: submissionId,
        tenantId,
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
        tenantId,
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
    return { ok: false, status: 409, error: 'İşlem zaten devam ediyor' }
  }

  // Reserve the analysis credit before any work runs. On exhaustion, revert the
  // job claim cleanly (keeps any prior completed report accessible).
  try {
    await reserveAnalysisCredit({ tenantId, submissionId, processingJobId: job.id })
  } catch (reserveErr) {
    if (reserveErr instanceof EntitlementExhaustedError) {
      await prisma
        .$transaction([
          prisma.processingJob.delete({ where: { id: job.id } }),
          prisma.submission.update({
            where: { id: submissionId },
            data: { status: submission.status },
          }),
        ])
        .catch(() => {})
      return {
        ok: false,
        status: 429,
        error: 'Aylık analiz hakkınız doldu. Devam etmek için paketinizi yükseltin.',
        code: 'ENTITLEMENT_EXHAUSTED',
      }
    }
    throw reserveErr
  }

  if (isTriggerEnabled()) {
    let handle: { id: string }
    try {
      const { tasks } = await import('@trigger.dev/sdk')
      handle = await tasks.trigger(
        'process-submission',
        {
          submissionId,
          tenantId,
          jobId: job.id,
        },
        {
          queue: submissionProcessingQueue.name,
          concurrencyKey: tenantId,
        },
      )
      await prisma.processingJob.update({
        where: { id: job.id },
        data: { triggerJobId: handle.id },
      })
    } catch (triggerErr) {
      const errorMessage = triggerErr instanceof Error
        ? triggerErr.message
        : 'İşleme işi başlatılamadı'
      await failClaimedJob(submissionId, job.id, errorMessage)
      await refundMetric({
        metric: UsageMetric.ANALYSIS,
        processingJobId: job.id,
        reason: 'trigger_failed',
      }).catch(() => {})
      throw triggerErr
    }

    return {
      ok: true,
      jobId: job.id,
      status: job.status,
      currentStep: job.currentStep,
      errorMessage: null,
      async: true,
      triggerRunId: handle.id,
    }
  }

  if (!allowsSyncProcessingFallback()) {
    const errorMessage = 'Arka plan işleme başlatılamadı'
    await failClaimedJob(submissionId, job.id, errorMessage)
    await refundMetric({
      metric: UsageMetric.ANALYSIS,
      processingJobId: job.id,
      reason: 'processing_unavailable',
    }).catch(() => {})
    return {
      ok: false,
      status: 503,
      error: errorMessage,
      code: 'PROCESSING_UNAVAILABLE',
    }
  }

  await processSubmission(submissionId, tenantId, job.id)

  const finalJob = await prisma.processingJob.findUnique({
    where: { id: job.id },
    select: { id: true, status: true, currentStep: true, errorMessage: true },
  })

  return {
    ok: true,
    jobId: job.id,
    status: finalJob?.status ?? 'UNKNOWN',
    currentStep: finalJob?.currentStep ?? null,
    errorMessage: finalJob?.errorMessage ?? null,
    async: false,
  }
}

export function isProcessingActive(status: string): boolean {
  return BLOCKED_PROCESSING_STATUSES.includes(status)
}

function isTriggerEnabled(): boolean {
  return Boolean(process.env['TRIGGER_SECRET_KEY'])
}

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
