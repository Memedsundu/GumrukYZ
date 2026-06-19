import { task, logger } from '@trigger.dev/sdk'
import { finalizeExpertReviewRun } from '@/lib/expert-review-runner'
import { expertReviewQueue } from './queues'

export const expertReviewTask = task({
  id: 'expert-review',
  queue: expertReviewQueue,
  maxDuration: 300,

  run: async (payload: {
    submissionId: string
    tenantId: string
    reviewId: string
    processingJobId?: string | null
  }) => {
    logger.info('Starting expert review', payload)

    const result = await finalizeExpertReviewRun(payload)

    logger.info('Expert review complete', {
      reviewId: payload.reviewId,
      status: result?.status ?? null,
    })

    return { reviewId: payload.reviewId, status: result?.status ?? 'ERROR' }
  },
})
