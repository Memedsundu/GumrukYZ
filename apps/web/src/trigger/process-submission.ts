/**
 * Trigger.dev durable task for processing customs submissions.
 *
 * Runs in Trigger.dev managed infrastructure (Wave 2 — async-only in production).
 */
import { task, logger } from '@trigger.dev/sdk'
import { processSubmission } from '@/lib/processing'
import { submissionProcessingQueue } from './queues'

export const processSubmissionTask = task({
  id: 'process-submission',
  queue: submissionProcessingQueue,
  maxDuration: 300,

  run: async (payload: { submissionId: string; tenantId: string; jobId: string }) => {
    const { submissionId, tenantId, jobId } = payload

    logger.info('Starting submission processing', { submissionId, tenantId, jobId })

    await processSubmission(submissionId, tenantId, jobId)

    logger.info('Submission processing complete', { submissionId })

    return { submissionId, status: 'completed' }
  },
})
