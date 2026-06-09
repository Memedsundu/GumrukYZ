import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const toneStyles = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
  ai: 'bg-ai-50 text-ai-600',
  neutral: 'bg-surface-muted text-ink-muted',
} as const

export type StatTone = keyof typeof toneStyles

export interface StatCardProps {
  icon: LucideIcon
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: StatTone
  className?: string
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'brand', className }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface p-5 shadow-card', className)}>
      <div className="flex items-start gap-4">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', toneStyles[tone])}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-ink">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-ink-subtle">{sub}</p>}
        </div>
      </div>
    </div>
  )
}
