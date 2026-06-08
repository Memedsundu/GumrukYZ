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
    label: 'Hızlı yapay zeka kural kontrolü',
    description: 'Kural sonuçları hızlı ve düşük maliyetli yapay zeka modeliyle gözden geçiriliyor.',
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
    label: 'Uzman yapay zeka incelemesi',
    description: 'Önceki bir işlem uzman yapay zeka incelemesi aşamasında görünüyor.',
  },
}

export type ProcessingProgress = ProgressDefinition & {
  status: string
}

export function getProcessingProgress(status: string, currentStep?: string | null): ProcessingProgress {
  const key = currentStep && PROGRESS_BY_STATUS[currentStep] ? currentStep : status
  const definition = PROGRESS_BY_STATUS[key] ?? {
    percent: 0,
    label: 'Durum alınıyor',
    description: 'İşlem durumu hazırlanıyor.',
  }

  return {
    status: key,
    ...definition,
  }
}
