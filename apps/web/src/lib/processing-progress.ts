type ProgressDefinition = {
  percent: number
  label: string
  description: string
}

const PROGRESS_BY_STATUS: Record<string, ProgressDefinition> = {
  PENDING: {
    percent: 0,
    label: 'Başlamadı',
    description: 'Belgeler yüklendikten sonra analiz başlatılacak.',
  },
  UPLOADED: {
    percent: 8,
    label: 'Belgeler hazır',
    description: 'Belgeler yüklendi; sınıflandırma ve doğrulama bekleniyor.',
  },
  CLASSIFYING: {
    percent: 14,
    label: 'Sınıflandırma',
    description: 'Belge türleri ve işlem yönü tahmini hazırlanıyor.',
  },
  AWAITING_VALIDATION: {
    percent: 22,
    label: 'Doğrulama bekleniyor',
    description: 'Öneriler kullanıcı doğrulaması bekliyor.',
  },
  EXTRACTING: {
    percent: 38,
    label: 'Veri çıkarımı',
    description: 'Belgeler okunuyor ve alanlar çıkarılıyor.',
  },
  NORMALIZING: {
    percent: 55,
    label: 'Normalizasyon',
    description: 'Çıkarılan bilgiler karşılaştırılabilir hale getiriliyor.',
  },
  RUNNING_RULES: {
    percent: 70,
    label: 'Kural kontrolü',
    description: 'Gümrük kontrol kuralları çalıştırılıyor.',
  },
  AI_RULE_VALIDATING: {
    percent: 84,
    label: 'Otomatik Risk Kontrolü',
    description: 'Kural sonuçları her analizde çalışan otomatik risk kontrolünden geçiriliyor.',
  },
  GENERATING_REPORT: {
    percent: 94,
    label: 'Rapor hazırlanıyor',
    description: 'Risk özeti ve rapor çıktısı hazırlanıyor.',
  },
  COMPLETED: {
    percent: 100,
    label: 'Tamamlandı',
    description: 'Analiz tamamlandı; rapor görüntülenebilir.',
  },
  FAILED: {
    percent: 100,
    label: 'Başarısız',
    description: 'İşlem tamamlanamadı. Hata detayını kontrol edin.',
  },
  EXPERT_REVIEWING: {
    percent: 92,
    label: 'Uzman İncelemesi',
    description: 'Önceki bir işlem Uzman İncelemesi aşamasında görünüyor.',
  },
}

const STEP_RANGES: Record<string, { min: number; max: number }> = {
  CLASSIFYING: { min: 14, max: 22 },
  EXTRACTING: { min: 38, max: 54 },
  NORMALIZING: { min: 55, max: 69 },
  RUNNING_RULES: { min: 70, max: 83 },
  AI_RULE_VALIDATING: { min: 84, max: 93 },
  GENERATING_REPORT: { min: 94, max: 99 },
}

const TIME_CREEP_STEPS = new Set([
  'CLASSIFYING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
  'GENERATING_REPORT',
])

export type ProcessingProgress = ProgressDefinition & {
  status: string
  progressDetail?: string
}

export type SubmissionProgressContext = {
  status: string
  currentStep?: string | null
  documentsDone?: number
  documentsTotal?: number
  startedAt?: Date | string | null
  updatedAt?: Date | string | null
}

function resolveStepKey(status: string, currentStep?: string | null): string {
  return currentStep && PROGRESS_BY_STATUS[currentStep] ? currentStep : status
}

function timeCreepWithinStep(min: number, max: number, referenceTime: Date | string): number {
  const elapsedMs = Date.now() - new Date(referenceTime).getTime()
  const elapsedSec = Math.max(0, elapsedMs / 1000)
  const creep = Math.min(3, (elapsedSec / 10) * 0.5)
  return Math.min(max - 0.5, min + creep)
}

function interpolateRange(min: number, max: number, ratio: number): number {
  return min + Math.max(0, Math.min(1, ratio)) * (max - min)
}

export function computeSubmissionProgress(ctx: SubmissionProgressContext): ProcessingProgress {
  const key = resolveStepKey(ctx.status, ctx.currentStep)
  const base = PROGRESS_BY_STATUS[key] ?? {
    percent: 0,
    label: 'Durum alınıyor',
    description: 'İşlem durumu hazırlanıyor.',
  }

  if (key === 'COMPLETED' || key === 'FAILED') {
    return { status: key, ...base, percent: base.percent }
  }

  let percent = base.percent
  let description = base.description
  let progressDetail: string | undefined

  const range = STEP_RANGES[key]

  if (key === 'EXTRACTING' && ctx.documentsTotal && ctx.documentsTotal > 0) {
    const done = ctx.documentsDone ?? 0
    percent = interpolateRange(range.min, range.max, done / ctx.documentsTotal)
    progressDetail = `${done}/${ctx.documentsTotal} belge okundu`
    if (done > 0) {
      description = `${done}/${ctx.documentsTotal} belge okundu; alanlar çıkarılıyor.`
    }
  } else if (range && TIME_CREEP_STEPS.has(key)) {
    const referenceTime = ctx.updatedAt ?? ctx.startedAt
    if (referenceTime) {
      percent = timeCreepWithinStep(range.min, range.max, referenceTime)
    } else {
      percent = range.min
    }
  } else if (range) {
    percent = range.min
  }

  return {
    status: key,
    label: base.label,
    description,
    percent: Math.round(Math.max(0, Math.min(99, percent))),
    progressDetail,
  }
}

export function getProcessingProgress(status: string, currentStep?: string | null): ProcessingProgress {
  return computeSubmissionProgress({ status, currentStep })
}

export function initialAnalysisProgress(): ProcessingProgress {
  return {
    status: 'CLASSIFYING',
    label: 'Analiz başlatılıyor',
    description: 'İş kuyruğu hazırlanıyor. İlerleme tahmini olarak gösterilir.',
    percent: PROGRESS_BY_STATUS.CLASSIFYING!.percent,
  }
}
