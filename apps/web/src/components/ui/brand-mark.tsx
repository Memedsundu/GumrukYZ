import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg'
  /** Kept for API compatibility; tagline is included in the lockup image. */
  subtitle?: boolean
  /** Compact square mark for collapsed rails and icon contexts. */
  monogram?: boolean
  className?: string
}

const sizeMap = {
  sm: { lockupHeight: 28, markSize: 32 },
  md: { lockupHeight: 36, markSize: 40 },
  lg: { lockupHeight: 56, markSize: 48 },
} as const

/**
 * Mizan brand mark — horizontal lockup or square document/gauge mark.
 */
export function BrandMark(props: BrandMarkProps) {
  const { size = 'md', monogram = false, className } = props
  const s = sizeMap[size]

  if (monogram) {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center', className)} aria-label="Mizan">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, dimensions fixed */}
        <img
          src="/brand/mizan-mark.png"
          alt=""
          width={s.markSize}
          height={s.markSize}
          className="block object-contain"
          style={{ width: s.markSize, height: s.markSize }}
        />
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex max-w-full shrink-0 items-center', className)}
      aria-label="Mizan — A ZANAI product"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, dimensions fixed */}
      <img
        src="/brand/mizan-logo.png"
        alt=""
        className="block max-w-full object-contain"
        style={{ height: s.lockupHeight, width: 'auto' }}
      />
    </span>
  )
}
