'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'

type Quota = {
  limit: number
  used: number
  remaining: number
  usedOn: string
  period: 'DAILY'
}

export default function ExpertReviewButton({
  submissionId,
  quota,
  hasCompletedExpertReview,
}: {
  submissionId: string
  quota: Quota
  hasCompletedExpertReview: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentQuota, setCurrentQuota] = useState(quota)

  const disabled = loading || currentQuota.remaining <= 0
  const cta = hasCompletedExpertReview
    ? currentQuota.remaining <= 0
      ? 'Bugünkü uzman AI hakkı kalmadı'
      : 'Uzman AI incelemesini yenile'
    : currentQuota.remaining <= 0
      ? 'Bugünkü uzman AI hakkı kalmadı'
      : 'Uzman AI incelemesi başlat'

  async function startExpertReview() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/submissions/${submissionId}/expert-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: hasCompletedExpertReview }),
      })
      const data = await res.json() as { error?: string; quota?: Quota }
      if (data.quota) setCurrentQuota(data.quota)
      if (!res.ok) throw new Error(data.error ?? 'Uzman AI incelemesi başlatılamadı')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uzman AI incelemesi başlatılamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-5 py-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-950">Uzman AI incelemesi</p>
          <p className="mt-1 text-sm text-indigo-800">
            Kural raporundan sonra isteğe bağlı çalışır. Bugünkü kalan hak: {currentQuota.remaining}/{currentQuota.limit}.
          </p>
        </div>
        <button
          type="button"
          onClick={startExpertReview}
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? 'İnceleme çalışıyor' : cta}
        </button>
      </div>
      <p className="mt-2 text-xs text-indigo-700">
        Hızlı AI kural kontrolü her analizde otomatik çalışır; uzman incelemesini başlatmak veya yenilemek bugünkü haktan düşer.
      </p>
      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
