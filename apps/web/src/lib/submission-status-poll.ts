export type SubmissionStatusResponse = {
  submissionId: string
  status: string
  classificationStatus: string
  progressPercent: number
  progressLabel: string
  progressDescription: string
  progressDetail?: string | null
  job?: {
    errorMessage?: string | null
  } | null
}

export type ProcessingProgressUpdate = {
  percent: number
  label: string
  description: string
  detail?: string | null
}

export function mapStatusToProgressUpdate(data: SubmissionStatusResponse): ProcessingProgressUpdate {
  return {
    percent: data.progressPercent,
    label: data.progressLabel,
    description: data.progressDescription,
    detail: data.progressDetail,
  }
}

export async function fetchSubmissionStatus(submissionId: string): Promise<SubmissionStatusResponse> {
  const res = await fetch(`/api/submissions/${submissionId}/status`)
  if (!res.ok) {
    throw new Error('İşlem durumu alınamadı')
  }
  return res.json() as Promise<SubmissionStatusResponse>
}

export function createPollScheduler(options?: {
  baseIntervalMs?: number
  maxIntervalMs?: number
  hiddenMultiplier?: number
}) {
  const baseIntervalMs = options?.baseIntervalMs ?? 3000
  const maxIntervalMs = options?.maxIntervalMs ?? 15000
  const hiddenMultiplier = options?.hiddenMultiplier ?? 4

  function computeDelayMs(attempt: number): number {
    const backoffSteps = Math.floor(attempt / 10)
    const withBackoff = Math.min(baseIntervalMs * 1.5 ** backoffSteps, maxIntervalMs)
    const jitter = withBackoff * (0.8 + Math.random() * 0.4)
    const hidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden'
    return Math.round(jitter * (hidden ? hiddenMultiplier : 1))
  }

  return function waitForNextPoll(attempt: number): Promise<void> {
    const delayMs = computeDelayMs(attempt)

    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null

      const done = () => {
        if (timer !== null) clearTimeout(timer)
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisible)
        }
        resolve()
      }

      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          done()
        }
      }

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisible)
      }

      timer = setTimeout(done, delayMs)
    })
  }
}

const defaultWaitForNextPoll = createPollScheduler()

export async function pollSubmissionUntilSettled(
  submissionId: string,
  options: {
    onUpdate: (data: SubmissionStatusResponse) => void
    intervalMs?: number
    maxAttempts?: number
    isCancelled?: () => boolean
    waitForNextPoll?: (attempt: number) => Promise<void>
  },
): Promise<SubmissionStatusResponse> {
  const maxAttempts = options.maxAttempts ?? 120
  const waitForNextPoll =
    options.waitForNextPoll ??
    (options.intervalMs !== undefined
      ? createPollScheduler({ baseIntervalMs: options.intervalMs })
      : defaultWaitForNextPoll)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options.isCancelled?.()) {
      throw new Error('İşlem iptal edildi')
    }

    const data = await fetchSubmissionStatus(submissionId)
    if (!options.isCancelled?.()) {
      options.onUpdate(data)
    }

    if (data.status === 'COMPLETED') {
      return data
    }
    if (data.status === 'FAILED') {
      throw new Error(data.job?.errorMessage ?? 'İşleme başarısız')
    }
    if (data.status === 'AWAITING_VALIDATION' || data.classificationStatus === 'AWAITING_VALIDATION') {
      return data
    }

    await waitForNextPoll(attempt)
  }

  throw new Error('İşlem zaman aşımına uğradı. Lütfen dosya detayından durumu kontrol edin.')
}

export async function startProcessingWithProgress(
  submissionId: string,
  options: {
    onUpdate: (data: SubmissionStatusResponse) => void
    intervalMs?: number
    maxAttempts?: number
  },
): Promise<SubmissionStatusResponse> {
  const processResponse = await fetch(`/api/submissions/${submissionId}/process`, { method: 'POST' })
  const processData = await processResponse.json() as { error?: string; errorMessage?: string | null }

  if (!processResponse.ok) {
    throw new Error(processData.error ?? processData.errorMessage ?? 'İşleme başarısız')
  }

  return pollSubmissionUntilSettled(submissionId, options)
}
