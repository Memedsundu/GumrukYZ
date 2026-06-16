'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type Quota = {
  limit: number
  used: number
  remaining: number
  usedOn: string
  period: 'MONTHLY'
}

export default function ExpertReviewButton({
  submissionId,
  quota,
  hasCompletedExpertReview,
  recommended,
}: {
  submissionId: string
  quota: Quota
  hasCompletedExpertReview: boolean
  recommended: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentQuota, setCurrentQuota] = useState(quota)

  const disabled = loading || currentQuota.remaining <= 0
  const cta = hasCompletedExpertReview
    ? currentQuota.remaining <= 0
      ? 'Uzman İncelemesi hakkınız kalmadı'
      : 'Uzman İncelemesini yenile'
    : currentQuota.remaining <= 0
      ? 'Uzman İncelemesi hakkınız kalmadı'
      : 'Uzman İncelemesi başlat'

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
      if (!res.ok) throw new Error(data.error ?? 'Uzman İncelemesi başlatılamadı')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uzman İncelemesi başlatılamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn(loading && 'animate-pulse-soft')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ai-700">
              <Sparkles className="h-4 w-4" />
              Uzman İncelemesi
            </p>
            <p className="mt-1 text-sm leading-5 text-ai-700">
              GTİP, kıymet, menşe, ürün mevzuatı veya belge çelişkisi gibi yorum gerektiren risklerde ikinci kontrol sağlar.
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-1 text-xs font-semibold',
              recommended ? 'bg-warning-100 text-warning-700' : 'bg-ai-100 text-ai-700',
            )}
          >
            {recommended ? 'Önerilir' : 'İsteğe bağlı'}
          </span>
        </div>
        <div>
          <p className="text-sm leading-5 text-ai-600">
            Bu ay kalan hak: {currentQuota.remaining}/{currentQuota.limit}.
          </p>
          <p className="mt-1 text-xs leading-5 text-ai-600">
            Başlatmak veya yenilemek 1 Uzman İncelemesi hakkı kullanır.
          </p>
        </div>
        <button
          type="button"
          onClick={startExpertReview}
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-lg bg-ai-600 px-4 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:bg-ai-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? 'İnceleme çalışıyor' : cta}
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-ai-600">
        Otomatik Risk Kontrolü her analizde çalışır ve Uzman İncelemesi hakkından düşmez.
      </p>
      {error && (
        <div className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}
    </div>
  )
}
