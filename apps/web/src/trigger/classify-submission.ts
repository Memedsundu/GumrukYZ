import { task, logger } from '@trigger.dev/sdk'
import { prisma } from '@gumrukyz/db'
import { classifySubmissionDocuments } from '@/lib/classification'
import { classificationQueue } from './queues'

export const classifySubmissionTask = task({
  id: 'classify-submission',
  queue: classificationQueue,
  maxDuration: 300,

  run: async (payload: { submissionId: string; tenantId: string }) => {
    const { submissionId, tenantId } = payload
    logger.info('Starting submission classification', { submissionId, tenantId })

    try {
      const result = await classifySubmissionDocuments({ submissionId, tenantId })
      logger.info('Submission classification complete', {
        submissionId,
        documentCount: result.documents.length,
      })
      return { submissionId, classificationStatus: result.submission.classificationStatus }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Classification failed'
      logger.error('Submission classification failed', { submissionId, error: message })
      await prisma.submission.updateMany({
        where: { id: submissionId, tenantId, classificationStatus: 'RUNNING' },
        data: {
          status: 'UPLOADED',
          classificationStatus: 'PENDING',
        },
      })
      throw err
    }
  },
})
