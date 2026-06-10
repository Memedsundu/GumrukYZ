import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RiskScore } from '@/components/ui/risk-score'
import { FILTERS, type FilterKey } from './report-filters'
import type { ReportCounts, ReportFindingItem } from './report-types'

type FilterCounts = Record<FilterKey, number>

/**
 * Desktop (xl+) severity rail: the consultant's instrument panel.
 * Mini gauge → severity filters → the single next action.
 */
export function SeverityRail({
  counts,
  filterCounts,
  activeFilter,
  onFilterChange,
  nextFinding,
  onOpenFinding,
}: {
  counts: ReportCounts
  filterCounts: FilterCounts
  activeFilter: FilterKey
  onFilterChange: (filter: FilterKey) => void
  nextFinding: ReportFindingItem | null
  onOpenFinding: (id: string) => void
}) {
  return (
    <div className="sticky top-20 space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex justify-center pb-4">
          <RiskScore errors={counts.errors} warnings={counts.warnings} reviews={counts.reviewNeeded} size={88} />
        </div>
        <nav aria-label="Bulgu filtreleri" className="space-y-1 border-t border-line pt-3">
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.key
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => onFilterChange(filter.key)}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors',
                  active ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                )}
              >
                <span>{filter.label}</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs',
                    active ? 'bg-white/20 text-white' : 'bg-surface-muted text-ink-subtle',
                  )}
                >
                  {filterCounts[filter.key]}
                </span>
              </button>
            )
          })}
        </nav>
      </section>

      <NextActionCard finding={nextFinding} onOpenFinding={onOpenFinding} />
    </div>
  )
}

function NextActionCard({
  finding,
  onOpenFinding,
}: {
  finding: ReportFindingItem | null
  onOpenFinding: (id: string) => void
}) {
  if (!finding) {
    return (
      <section className="rounded-2xl border border-success-200 bg-success-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-success-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Engelleyici bulgu yok
        </p>
      </section>
    )
  }
  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Sıradaki adım</p>
      <p className="mt-1.5 line-clamp-3 text-sm font-medium text-ink">{finding.title}</p>
      <button
        type="button"
        onClick={() => onOpenFinding(finding.id)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Detayı aç
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </section>
  )
}

/** Below xl: the rail collapses into a sticky horizontal filter strip. */
export function SeverityStrip({
  filterCounts,
  activeFilter,
  onFilterChange,
}: {
  filterCounts: FilterCounts
  activeFilter: FilterKey
  onFilterChange: (filter: FilterKey) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {FILTERS.map((filter) => {
        const active = activeFilter === filter.key
        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => onFilterChange(filter.key)}
            aria-pressed={active}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {filter.label}
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-xs',
                active ? 'bg-white/20 text-white' : 'bg-surface-muted text-ink-subtle',
              )}
            >
              {filterCounts[filter.key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
