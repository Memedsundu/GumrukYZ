/**
 * Trigger.dev v3 durable task for processing customs submissions.
 *
 * This task replaces the synchronous processSubmission call inside the API route.
 * It runs in Trigger.dev's managed infrastructure, surviving Vercel Function timeouts.
 *
 * Setup:
 *   1. Create a project at https://trigger.dev
 *   2. Set TRIGGER_SECRET_KEY and TRIGGER_PROJECT_ID env vars
 *   3. Run: npx trigger.dev@latest dev (local) or deploy via CI
 */
import { task, logger } from '@trigger.dev/sdk/v3'
import { processSubmission } from '@/lib/processing'

export const processSubmissionTask = task({
  id: 'process-submission',
  maxDuration: 300,

  run: async (payload: { submissionId: string; tenantId: string; jobId: string }) => {
    const { submissionId, tenantId, jobId } = payload

    logger.info('Starting submission processing', { submissionId, tenantId, jobId })

    await processSubmission(submissionId, tenantId, jobId)

    logger.info('Submission processing complete', { submissionId })

    return { submissionId, status: 'completed' }
  },
})
