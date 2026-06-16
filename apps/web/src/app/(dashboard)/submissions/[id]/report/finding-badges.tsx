import { AlertCircle, CheckCircle, Info, Sparkles, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportCounts } from './report-types'

export function ResultIcon({ result }: { result: string }) {
  if (result === 'FAIL') return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-500" />
  if (result === 'WARN') return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-500" />
  if (result === 'REVIEW_NEEDED') return <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
  return <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
}

export function ResultBadge({ result, label }: { result: string; label: string }) {
  const tone = resultTone(result)
  return <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', tone.badge)}>{label}</span>
}

export function SourceTypeBadge({ label }: { label: string }) {
  const isExpert = label.includes('Uzman İncelemesi')
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium', isExpert ? 'bg-ai-50 text-ai-700' : 'bg-surface-muted text-ink-muted')}>
      {isExpert && <Sparkles className="h-3 w-3" />}
      {label}
    </span>
  )
}

export function resultTone(result: string) {
  if (result === 'FAIL') {
    return {
      border: 'border-danger-200',
      accent: 'border-l-danger-500',
      badge: 'bg-danger-100 text-danger-700',
    }
  }
  if (result === 'WARN') {
    return {
      border: 'border-warning-200',
      accent: 'border-l-warning-500',
      badge: 'bg-warning-100 text-warning-700',
    }
  }
  if (result === 'REVIEW_NEEDED') {
    return {
      border: 'border-brand-200',
      accent: 'border-l-brand-500',
      badge: 'bg-brand-100 text-brand-700',
    }
  }
  return {
    border: 'border-line',
    accent: 'border-l-success-500',
    badge: 'bg-success-100 text-success-700',
  }
}

export function Metric({ label, value, tone }: { label: string; value: number; tone: 'red' | 'blue' | 'amber' | 'green' }) {
  const map = {
    red: 'border-danger-100 bg-danger-50 text-danger-700',
    blue: 'border-brand-100 bg-brand-50 text-brand-700',
    amber: 'border-warning-100 bg-warning-50 text-warning-700',
    green: 'border-success-100 bg-success-50 text-success-700',
  }
  return (
    <div className={cn('rounded-xl border px-3 py-3', map[tone])}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
    </div>
  )
}

export function RiskBadge({ counts }: { counts: ReportCounts }) {
  if (counts.errors > 0) {
    return <span className="rounded-full bg-danger-100 px-3 py-1 text-sm font-semibold text-danger-700">{counts.errors} hata</span>
  }
  if (counts.reviewNeeded > 0) {
    return (
      <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">
        {counts.reviewNeeded} inceleme
      </span>
    )
  }
  if (counts.warnings > 0) {
    return (
      <span className="rounded-full bg-warning-100 px-3 py-1 text-sm font-semibold text-warning-700">
        {counts.warnings} uyarı
      </span>
    )
  }
  return <span className="rounded-full bg-success-100 px-3 py-1 text-sm font-semibold text-success-700">Temiz</span>
}
