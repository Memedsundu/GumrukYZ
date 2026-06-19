import { prisma } from '@gumrukyz/db'
import { classifySubmissionDocuments, type ClassificationResponse } from './classification'
import { allowsSyncProcessingFallback, isAsyncProcessingRequired } from './runtime-env'
import { checkSpendAllowed } from './spend-guard'
import './spend-guard-init'
import { classificationQueue } from '@/trigger/queues'

export type StartClassificationResult =
  | {
      ok: true
      async: true
      classificationStatus: 'RUNNING'
      triggerRunId: string
    }
  | {
      ok: true
      async: false
      result: ClassificationResponse
    }
  | {
      ok: false
      status: number
      error: string
      code?: string
    }

const STALE_CLASSIFICATION_MS = 30 * 60 * 1000

export async function startSubmissionClassification(params: {
  submissionId: string
  tenantId: string
}): Promise<StartClassificationResult> {
  const { submissionId, tenantId } = params

  await reconcileStaleClassifications()

  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, tenantId },
    include: { documents: true },
  })
  if (!submission) return { ok: false, status: 404, error: 'Dosya bulunamadı' }
  if (submission.documents.length === 0) {
    return { ok: false, status: 400, error: 'Henüz belge yüklenmedi' }
  }
  if (submission.classificationStatus === 'RUNNING' || submission.status === 'CLASSIFYING') {
    return { ok: false, status: 409, error: 'Sınıflandırma zaten devam ediyor' }
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
      error: 'Arka plan sınıflandırma şu an kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
      code: 'CLASSIFICATION_UNAVAILABLE',
    }
  }

  // Atomic claim BEFORE enqueue. Two simultaneous POSTs would otherwise both pass
  // the soft guard above and enqueue duplicate runs — and each run re-reads every
  // document through Azure + OpenAI, so a duplicate is a direct double-cost (and a
  // duplicate-suggestion race). Claiming here also makes the DB reflect RUNNING
  // immediately so the client poll and the stale-classification reaper both work.
  const claimed = await prisma.submission.updateMany({
    where: {
      id: submissionId,
      tenantId,
      classificationStatus: { not: 'RUNNING' },
      status: { not: 'CLASSIFYING' },
    },
    data: { status: 'CLASSIFYING', classificationStatus: 'RUNNING' },
  })
  if (claimed.count !== 1) {
    return { ok: false, status: 409, error: 'Sınıflandırma zaten devam ediyor' }
  }

  if (isTriggerEnabled()) {
    try {
      const { tasks } = await import('@trigger.dev/sdk')
      const handle = await tasks.trigger(
        'classify-submission',
        { submissionId, tenantId },
        {
          queue: classificationQueue.name,
          concurrencyKey: tenantId,
        },
      )
      return {
        ok: true,
        async: true,
        classificationStatus: 'RUNNING',
        triggerRunId: handle.id,
      }
    } catch (err) {
      await releaseClassificationClaim(submissionId, tenantId)
      const message = err instanceof Error ? err.message : 'Sınıflandırma işi başlatılamadı'
      throw new Error(message)
    }
  }

  if (!allowsSyncProcessingFallback()) {
    await releaseClassificationClaim(submissionId, tenantId)
    return {
      ok: false,
      status: 503,
      error: 'Arka plan sınıflandırma başlatılamadı',
      code: 'CLASSIFICATION_UNAVAILABLE',
    }
  }

  try {
    const result = await classifySubmissionDocuments({ submissionId, tenantId })
    return { ok: true, async: false, result }
  } catch (err) {
    await releaseClassificationClaim(submissionId, tenantId)
    throw err
  }
}

/** Revert a classification claim that never started work (enqueue/sync failure). */
async function releaseClassificationClaim(submissionId: string, tenantId: string): Promise<void> {
  await prisma.submission
    .updateMany({
      where: { id: submissionId, tenantId, status: 'CLASSIFYING', classificationStatus: 'RUNNING' },
      data: { status: 'UPLOADED', classificationStatus: 'PENDING' },
    })
    .catch(() => {})
}

export async function reconcileStaleClassifications(
  olderThanMs = STALE_CLASSIFICATION_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const updated = await prisma.submission.updateMany({
    where: {
      classificationStatus: 'RUNNING',
      updatedAt: { lt: cutoff },
    },
    data: {
      status: 'UPLOADED',
      classificationStatus: 'PENDING',
    },
  })
  return updated.count
}

function isTriggerEnabled(): boolean {
  return Boolean(process.env['TRIGGER_SECRET_KEY'])
}
