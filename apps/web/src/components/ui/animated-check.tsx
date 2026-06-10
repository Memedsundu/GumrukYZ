import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AnimatedCheckProps {
  size?: number
  className?: string
}

/**
 * Drawn-on-mount success check. The circle is static; only the tick strokes in
 * (check-draw keyframe, ≤400ms). Falls back to a static check under
 * prefers-reduced-motion via the global animation kill-switch.
 */
export function AnimatedCheck({ size = 40, className }: AnimatedCheckProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className={cn('text-success-600', className)}
    >
      <circle cx="20" cy="20" r="18" className="stroke-success-200" strokeWidth="2.5" />
      <path
        d="M12.5 20.5 L17.5 25.5 L27.5 14.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="22"
        className="animate-check-draw"
        style={{ ['--check-length' as string]: '22' }}
      />
    </svg>
  )
}
