import type { BadgeTone } from '@/components/ui/badge'

export type SubmissionStatusConfig = { label: string; tone: BadgeTone }

/** Single source of truth for submission status → label + badge tone. */
export const SUBMISSION_STATUS: Record<string, SubmissionStatusConfig> = {
  PENDING: { label: 'Bekliyor', tone: 'neutral' },
  UPLOADED: { label: 'Yüklendi', tone: 'info' },
  CLASSIFYING: { label: 'Sınıflandırılıyor', tone: 'info' },
  AWAITING_VALIDATION: { label: 'Doğrulama Bekliyor', tone: 'neutral' },
  EXTRACTING: { label: 'Çıkarılıyor', tone: 'info' },
  NORMALIZING: { label: 'Normalleştiriliyor', tone: 'info' },
  RUNNING_RULES: { label: 'Kural Çalışıyor', tone: 'warning' },
  AI_RULE_VALIDATING: { label: 'Yapay zeka kural kontrolü', tone: 'ai' },
  EXPERT_REVIEWING: { label: 'Uzman yapay zeka incelemesi', tone: 'ai' },
  GENERATING_REPORT: { label: 'Rapor Üretiliyor', tone: 'warning' },
  COMPLETED: { label: 'Tamamlandı', tone: 'success' },
  FAILED: { label: 'Başarısız', tone: 'danger' },
}

export function submissionStatusConfig(status: string): SubmissionStatusConfig {
  return SUBMISSION_STATUS[status] ?? { label: status, tone: 'neutral' }
}

export type TradeFlow = 'IMPORT' | 'EXPORT' | string | null | undefined

export function tradeFlowConfig(tradeFlow: TradeFlow): SubmissionStatusConfig {
  if (tradeFlow === 'IMPORT') return { label: 'İthalat', tone: 'ai' }
  if (tradeFlow === 'EXPORT') return { label: 'İhracat', tone: 'accent' }
  return { label: 'Doğrulanmadı', tone: 'neutral' }
}
