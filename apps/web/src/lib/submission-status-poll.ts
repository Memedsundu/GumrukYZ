export type SubmissionStatusResponse = {
  submissionId: string
  status: string
  classificationStatus: string
  progressPercent: number
  progressLabel: string
  progressDescription: string
  job?: {
    errorMessage?: string | null
  } | null
}

export async function fetchSubmissionStatus(submissionId: string): Promise<SubmissionStatusResponse> {
  const res = await fetch(`/api/submissions/${submissionId}/status`)
  if (!res.ok) {
    throw new Error('İşlem durumu alınamadı')
  }
  return res.json() as Promise<SubmissionStatusResponse>
}

export async function pollSubmissionUntilSettled(
  submissionId: string,
  options: {
    onUpdate: (data: SubmissionStatusResponse) => void
    intervalMs?: number
    maxAttempts?: number
  },
): Promise<SubmissionStatusResponse> {
  const intervalMs = options.intervalMs ?? 3000
  const maxAttempts = options.maxAttempts ?? 120

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await fetchSubmissionStatus(submissionId)
    options.onUpdate(data)

    if (data.status === 'COMPLETED') {
      return data
    }
    if (data.status === 'FAILED') {
      throw new Error(data.job?.errorMessage ?? 'İşleme başarısız')
    }
    if (data.status === 'AWAITING_VALIDATION' || data.classificationStatus === 'AWAITING_VALIDATION') {
      return data
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('İşlem zaman aşımına uğradı. Lütfen dosya detayından durumu kontrol edin.')
}
