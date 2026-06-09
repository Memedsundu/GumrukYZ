import * as React from 'react'
import { assessRisk, type RiskAssessment } from '@/lib/risk'
import { cn } from '@/lib/utils'

const strokeByLevel: Record<RiskAssessment['level'], string> = {
  clean: 'var(--color-success-500)',
  low: 'var(--color-brand-500)',
  medium: 'var(--color-warning-500)',
  high: 'var(--color-danger-500)',
}

const textByLevel: Record<RiskAssessment['level'], string> = {
  clean: 'text-success-700',
  low: 'text-brand-700',
  medium: 'text-warning-700',
  high: 'text-danger-700',
}

export interface RiskScoreProps {
  errors: number
  warnings: number
  reviews?: number
  size?: number
  className?: string
}

/** Circular risk gauge derived from finding counts. */
export function RiskScore({ errors, warnings, reviews = 0, size = 132, className }: RiskScoreProps) {
  const assessment = assessRisk({ errors, warnings, reviews })
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (assessment.score / 100) * circumference

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeByLevel[assessment.level]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-2xl font-bold tracking-tight', textByLevel[assessment.level])}>
            {assessment.score}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
            Risk skoru
          </span>
        </div>
      </div>
      <span className={cn('text-sm font-semibold', textByLevel[assessment.level])}>
        {assessment.label}
      </span>
    </div>
  )
}
