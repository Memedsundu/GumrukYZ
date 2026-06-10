import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RiskScore } from '@/components/ui/risk-score'
import { AnimatedCheck } from '@/components/ui/animated-check'
import ExpertReviewButton from './expert-review-button'
import { Metric } from './finding-badges'
import type { ExpertQuota, ReportCounts } from './report-types'

/**
 * The verdict surface: gauge, counts, AI summary and the expert-review action.
 * When nothing blocks the file, leads with a restrained all-clear band.
 */
export function CommandDeck({
  counts,
  summaryText,
  submissionId,
  expertQuota,
  hasCompletedExpertReview,
}: {
  counts: ReportCounts
  summaryText: string | null
  submissionId: string
  expertQuota: ExpertQuota
  hasCompletedExpertReview: boolean
}) {
  const allClear = counts.errors === 0 && counts.reviewNeeded === 0

  return (
    <section className="animate-fade-rise rounded-2xl border border-line bg-surface p-5 shadow-card">
      {allClear && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3">
          <AnimatedCheck size={36} className="shrink-0" />
          <div>
            <p className="font-display text-base font-semibold text-success-700">Engelleyici bulgu yok</p>
            <p className="text-sm text-success-700/85">
              {counts.warnings > 0
                ? `${counts.warnings} uyarı bilgi amaçlı listelendi.`
                : 'Tüm zorunlu kontroller geçti.'}
            </p>
          </div>
        </div>
      )}

      <div
        className={cn(
          'grid gap-5 lg:items-start',
          'lg:grid-cols-[auto_minmax(0,1fr)]',
          // At xl the rail carries the mini gauge, so the deck drops its own.
          'xl:grid-cols-[minmax(0,1fr)_300px]',
        )}
      >
        <div className="flex justify-center rounded-xl bg-canvas px-4 py-5 lg:px-6 xl:hidden">
          <RiskScore errors={counts.errors} warnings={counts.warnings} reviews={counts.reviewNeeded} />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Dosya durumu</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Hata" value={counts.errors} tone="red" />
            <Metric label="İnceleme gerekli" value={counts.reviewNeeded} tone="blue" />
            <Metric label="Uyarı" value={counts.warnings} tone="amber" />
            <Metric label="Geçti" value={counts.passes} tone="green" />
          </div>
          {summaryText && (
            <div className="mt-5 rounded-xl border-l-2 border-brand-500 bg-brand-50/50 py-3 pl-4 pr-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Info className="h-4 w-4 text-brand-600" />
                Yapay zeka özeti
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{summaryText}</p>
              <p className="mt-2 text-xs text-ink-subtle">
                Bilgilendirme amaçlıdır; bağlayıcı hukuki karar yerine geçmez.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-ai-100 bg-ai-50/60 p-4 lg:col-span-2 xl:col-span-1">
          <ExpertReviewButton
            submissionId={submissionId}
            quota={expertQuota}
            hasCompletedExpertReview={hasCompletedExpertReview}
          />
        </div>
      </div>
    </section>
  )
}
