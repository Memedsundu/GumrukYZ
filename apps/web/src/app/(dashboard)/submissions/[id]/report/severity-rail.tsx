import { cn } from '@/lib/utils'
import { FILTERS, type FilterKey } from './report-filters'

type FilterCounts = Record<FilterKey, number>

/** Shared compact report filter strip. */
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
