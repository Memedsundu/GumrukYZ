'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ACTIVE_PROCESSING_STATUSES, shouldPollSubmissionStatus } from '@/lib/submission-status'
import { fetchSubmissionStatus } from '@/lib/submission-status-poll'

type Props = {
  submissionId: string
  status: string
  classificationStatus: string
  hasReport: boolean
  reportStaleAt: string | null
  reportStaleReason: string | null
  willChargeReanalysis: boolean
  hasCompletedExpertReview: boolean
  latestFailedJobError: string | null
}

export function DossierStatusBanner({
  submissionId,
  status,
  classificationStatus,
  hasReport,
  reportStaleAt,
  reportStaleReason,
  willChargeReanalysis,
  hasCompletedExpertReview,
  latestFailedJobError,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onDocuments = pathname?.startsWith(`/submissions/${submissionId}/documents`) ?? false
  const activeProcessing = ACTIVE_PROCESSING_STATUSES.includes(status as (typeof ACTIVE_PROCESSING_STATUSES)[number])
  const reanalyzing = activeProcessing && hasReport
  const failed = status === 'FAILED'
  const stale = Boolean(reportStaleAt)
  const validationRequired = classificationStatus !== 'VALIDATED'

  // The report surface has no poller of its own, so a re-analysis triggered from
  // here would otherwise sit frozen until a manual refresh. Poll until the job
  // settles, then refresh. The documents tab already polls via its upload
  // workflow, so we skip it there to avoid duplicate status requests.
  useEffect(() => {
    if (!reanalyzing || onDocuments) return
    let cancelled = false
    async function poll() {
      while (!cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        if (cancelled) return
        try {
          const data = await fetchSubmissionStatus(submissionId)
          if (cancelled) return
          if (!shouldPollSubmissionStatus(data.status, data.classificationStatus)) {
            router.refresh()
            return
          }
        } catch {
          return
        }
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [reanalyzing, onDocuments, submissionId, router])

  if (!failed && !stale && !reanalyzing) return null

  async function startProcessing() {
    if (processing) return
    setProcessing(true)
    setError(null)

    try {
      const response = await fetch(`/api/submissions/${submissionId}/process`, { method: 'POST' })
      const payload = await response.json().catch(() => null) as { error?: string; errorMessage?: string | null } | null
      if (!response.ok) throw new Error(payload?.error ?? payload?.errorMessage ?? 'Analiz başlatılamadı')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analiz başlatılamadı')
    } finally {
      setProcessing(false)
    }
  }

  const tone = failed ? 'danger' : 'warning'
  const title = activeProcessing && hasReport
    ? 'Rapor yeniden analiz ediliyor'
    : failed
      ? 'Analiz tamamlanamadı'
      : 'Belgeler değişti - rapor güncel değil'
  const description = activeProcessing && hasReport
    ? 'Yeni rapor hazırlanırken eski rapor referans olarak gösterilir ve işlem tamamlanana kadar düzenlenemez.'
    : failed
      ? (latestFailedJobError ?? 'Son analiz işi başarısız oldu. Belgeleri kontrol edip analizi tekrar başlatabilirsiniz.')
      : (reportStaleReason ?? 'Belgeler değişti; rapor yeniden analiz bekliyor.')

  return (
    <section className={`mt-4 rounded-2xl border px-4 py-3 text-sm shadow-card ${
      tone === 'danger'
        ? 'border-danger-200 bg-danger-50 text-danger-800'
        : 'border-amber-200 bg-amber-50 text-amber-900'
    }`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {activeProcessing && hasReport ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            <p className={`mt-1 ${tone === 'danger' ? 'text-danger-700' : 'text-amber-800'}`}>{description}</p>
            {stale && !activeProcessing && (
              <p className="mt-1 text-amber-800">
                {willChargeReanalysis
                  ? 'Yeniden analiz 1 analiz hakkı kullanır.'
                  : 'Bu dosyada yeniden analiz ücretsizdir.'}
                {hasCompletedExpertReview ? ' Önceki uzman incelemesi yeni raporla geçersiz sayılır.' : ''}
              </p>
            )}
            {error && <p className="mt-2 text-danger-700">{error}</p>}
          </div>
        </div>

        {onDocuments || (activeProcessing && hasReport) ? null : validationRequired ? (
          <Button asChild variant="outline" size="sm" className="shrink-0 border-current bg-transparent">
            <Link href={`/submissions/${submissionId}/documents`}>Sınıflandırmayı doğrula</Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-current bg-transparent"
            loading={processing}
            onClick={startProcessing}
          >
            {!processing && <RefreshCw />}
            {failed ? 'Analizi tekrar başlat' : 'Yeniden Analiz Et'}
          </Button>
        )}
      </div>
    </section>
  )
}
