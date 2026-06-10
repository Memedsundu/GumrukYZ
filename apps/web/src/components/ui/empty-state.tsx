import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: LucideIcon
  /** Customs-themed scene from components/illustrations; takes precedence over icon. */
  illustration?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      {illustration ? (
        <div className="text-ink-subtle">{illustration}</div>
      ) : (
        Icon && (
          <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-muted text-ink-subtle">
            <Icon className="size-7" />
          </span>
        )
      )}
      <p className="mt-4 text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
