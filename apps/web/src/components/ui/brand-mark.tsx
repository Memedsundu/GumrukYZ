import * as React from 'react'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: { box: 'size-7 rounded-lg', icon: 'size-4', text: 'text-base' },
  md: { box: 'size-8 rounded-xl', icon: 'size-5', text: 'text-lg' },
  lg: { box: 'size-10 rounded-xl', icon: 'size-6', text: 'text-xl' },
}

/** GümrükYZ wordmark: shield tile + display-font name. */
export function BrandMark({ size = 'md', className }: BrandMarkProps) {
  const s = sizeMap[size]
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className={cn('flex items-center justify-center bg-brand-600 text-white shadow-sm', s.box)}>
        <ShieldCheck className={s.icon} aria-hidden />
      </span>
      <span className={cn('font-display font-bold tracking-tight text-ink', s.text)}>GümrükYZ</span>
    </span>
  )
}
