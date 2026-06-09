import * as React from 'react'
import { cn } from '@/lib/utils'

const sizes = {
  narrow: 'max-w-3xl',
  default: 'max-w-7xl',
  wide: 'max-w-[1500px]',
} as const

export interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof sizes
}

/**
 * Centered page container used by every in-app page: constrains width on wide
 * screens and provides consistent responsive padding. Pages keep their own
 * internal section spacing.
 */
export function PageShell({ size = 'default', className, children, ...props }: PageShellProps) {
  return (
    <div
      className={cn('mx-auto w-full px-4 py-8 sm:px-6 lg:px-10', sizes[size], className)}
      {...props}
    >
      {children}
    </div>
  )
}
