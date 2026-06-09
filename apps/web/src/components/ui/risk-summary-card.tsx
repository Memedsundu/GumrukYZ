import * as React from 'react'
import { XCircle, AlertTriangle, Search, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RiskSummaryItem {
  label: string
  value: number
}

const rows = [
  { key: 'errors', label: 'Hata', icon: XCircle, tone: 'text-danger-600', bg: 'bg-danger-50' },
  { key: 'warnings', label: 'Uyarı', icon: AlertTriangle, tone: 'text-warning-600', bg: 'bg-warning-50' },
  { key: 'reviews', label: 'İnceleme gerekli', icon: Search, tone: 'text-brand-600', bg: 'bg-brand-50' },
] as const

export interface RiskSummaryListProps {
  errors: number
  warnings: number
  reviews: number
  className?: string
}

/** Compact errors/warnings/reviews breakdown used in report + submission detail. */
export function RiskSummaryList({ errors, warnings, reviews, className }: RiskSummaryListProps) {
  const counts = { errors, warnings, reviews }
  const allClear = errors === 0 && warnings === 0 && reviews === 0

  if (allClear) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl bg-success-50 px-4 py-3 text-success-700', className)}>
        <CheckCircle2 className="size-5" />
        <span className="text-sm font-medium">Bulgu yok — dosya temiz görünüyor</span>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            <span className={cn('flex size-7 items-center justify-center rounded-lg', row.bg)}>
              <row.icon className={cn('size-4', row.tone)} />
            </span>
            {row.label}
          </span>
          <span className={cn('text-sm font-bold', row.tone)}>{counts[row.key]}</span>
        </div>
      ))}
    </div>
  )
}
