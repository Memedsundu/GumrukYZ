import type { BadgeTone } from '@/components/ui/badge'

export type RiskLevel = 'clean' | 'low' | 'medium' | 'high'

export interface RiskInput {
  errors: number
  warnings: number
  reviews?: number
}

export interface RiskAssessment {
  level: RiskLevel
  label: string
  tone: BadgeTone
  /** 0–100, higher = riskier. Used by the gauge. */
  score: number
}

/**
 * Derive an overall risk level from finding counts.
 * Any error → high; warnings/reviews → medium/low; otherwise clean.
 */
export function assessRisk({ errors, warnings, reviews = 0 }: RiskInput): RiskAssessment {
  if (errors > 0) {
    return { level: 'high', label: 'Yüksek risk', tone: 'danger', score: Math.min(100, 60 + errors * 8) }
  }
  if (warnings > 0) {
    return { level: 'medium', label: 'Orta risk', tone: 'warning', score: Math.min(55, 30 + warnings * 5) }
  }
  if (reviews > 0) {
    return { level: 'low', label: 'Düşük risk', tone: 'info', score: Math.min(28, 12 + reviews * 4) }
  }
  return { level: 'clean', label: 'Temiz', tone: 'success', score: 0 }
}
