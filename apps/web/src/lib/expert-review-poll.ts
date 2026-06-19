import { createPollScheduler } from './submission-status-poll'

const waitForNextPoll = createPollScheduler({ baseIntervalMs: 4000, maxIntervalMs: 12000 })

export async function pollExpertReviewUntilSettled(
  submissionId: string,
  options?: { maxAttempts?: number; isCancelled?: () => boolean },
): Promise<{
  status: string
  summary?: string | null
  warningCount?: number
  reviewNeededCount?: number
}> {
  const maxAttempts = options?.maxAttempts ?? 90

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options?.isCancelled?.()) {
      throw new Error('Uzman İncelemesi iptal edildi')
    }

    const res = await fetch(`/api/submissions/${submissionId}/expert-review`)
    if (!res.ok) {
      throw new Error('Uzman İncelemesi durumu alınamadı')
    }

    const data = await res.json() as {
      running?: boolean
      expertReview?: {
        status?: string
        summary?: string | null
        warningCount?: number
        reviewNeededCount?: number
      } | null
    }

    if (!data.running) {
      const review = data.expertReview
      const status = review?.status ?? 'ERROR'
      if (status === 'COMPLETED' || status === 'SKIPPED' || status === 'LEGAL_CONTEXT_INCOMPLETE') {
        return {
          status,
          summary: review?.summary ?? null,
          warningCount: review?.warningCount,
          reviewNeededCount: review?.reviewNeededCount,
        }
      }
      if (status === 'ERROR') {
        throw new Error(review?.summary ?? 'Uzman İncelemesi tamamlanamadı')
      }
      return {
        status,
        summary: review?.summary ?? null,
        warningCount: review?.warningCount,
        reviewNeededCount: review?.reviewNeededCount,
      }
    }

    await waitForNextPoll(attempt)
  }

  throw new Error('Uzman İncelemesi zaman aşımına uğradı. Lütfen sayfayı yenileyin.')
}
