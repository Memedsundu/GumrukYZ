import { Info } from 'lucide-react'
import { RiskScore } from '@/components/ui/risk-score'
import { AnimatedCheck } from '@/components/ui/animated-check'
import { Metric } from './finding-badges'
import type { ReportCounts } from './report-types'

/**
 * The verdict surface: gauge, counts, and AI summary.
 * When nothing blocks the file, leads with a restrained all-clear band.
 */
export function CommandDeck({
  counts,
  summaryText,
}: {
  counts: ReportCounts
  summaryText: string | null
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

      <div className="grid gap-5 lg:grid-cols-[176px_minmax(0,1fr)] lg:items-start">
        <div className="flex justify-center rounded-xl bg-canvas px-4 py-5 lg:px-6">
          <RiskScore errors={counts.errors} warnings={counts.warnings} reviews={counts.reviewNeeded} />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Dosya durumu</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <Metric label="Hata" value={counts.errors} tone="red" />
            <Metric label="İnceleme gerekli" value={counts.reviewNeeded} tone="blue" />
            <Metric label="Uyarı" value={counts.warnings} tone="amber" />
            <Metric label="Geçti" value={counts.passes} tone="green" />
          </div>
        </div>
      </div>

      {summaryText && (
        <div className="mt-5 rounded-xl border-l-2 border-brand-500 bg-brand-50/50 py-4 pl-4 pr-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Info className="h-4 w-4 text-brand-600" />
            Yapay zeka özeti
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-ink-muted">{summaryText}</p>
          <p className="mt-2 text-xs text-ink-subtle">
            Bilgilendirme amaçlıdır; bağlayıcı hukuki karar yerine geçmez.
          </p>
        </div>
      )}
    </section>
  )
}
