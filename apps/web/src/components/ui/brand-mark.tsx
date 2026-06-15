import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg'
  /** Render the "A ZANAI product" descriptor under the wordmark. */
  subtitle?: boolean
  /** Compact "M" monogram for collapsed rails (text only — no logo image). */
  monogram?: boolean
  className?: string
}

const sizeMap = {
  sm: { name: 'text-base', sub: 'text-[9px]' },
  md: { name: 'text-lg', sub: 'text-[10px]' },
  lg: { name: 'text-2xl', sub: 'text-[11px]' },
}

/**
 * Mizan text wordmark — "Mizan" with the "A ZANAI product" descriptor.
 * Intentionally logo-free for now; a dedicated mark will be designed later.
 */
export function BrandMark({ size = 'md', subtitle = true, monogram = false, className }: BrandMarkProps) {
  const s = sizeMap[size]

  if (monogram) {
    return (
      <span
        className={cn('font-display text-xl font-bold tracking-tight text-brand-700', className)}
        aria-label="Mizan"
      >
        M
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex flex-col leading-none', className)}
      aria-label="Mizan — A ZANAI product"
    >
      <span className={cn('font-display font-bold tracking-tight text-ink', s.name)}>Mizan</span>
      {subtitle && (
        <span className={cn('mt-1 font-semibold uppercase tracking-[0.2em] text-ink-subtle', s.sub)}>
          A ZANAI product
        </span>
      )}
    </span>
  )
}
