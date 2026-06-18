export const ACTIVE_PROCESSING_STATUSES = [
  'CLASSIFYING',
  'EXTRACTING',
  'NORMALIZING',
  'RUNNING_RULES',
  'AI_RULE_VALIDATING',
  'GENERATING_REPORT',
] as const

export const USER_ACTION_REFRESH_STATUSES = [
  'AWAITING_VALIDATION',
  'UPLOADED',
  'COMPLETED',
  'FAILED',
] as const

export type SubmissionStatusSnapshot = {
  status: string
  classificationStatus: string
  progressPercent?: number
  progressLabel?: string
  progressDescription?: string
}

export type SubmissionNextAction = {
  title: string
  description: string
  cta: string
  href: string
  loading: boolean
  disabled: boolean
  showProgress: boolean
  progressPercent: number
}

export type DocumentWorkflowAction = {
  title: string
  description: string
  cta: string
  action: 'upload' | 'classify' | 'validate' | 'process'
  disabled: boolean
  loading: boolean
  blockingReasons: string[]
}

export type DocumentWorkflowActionParams = {
  submissionStatus: string
  classificationStatus: string
  documentCount: number
  needsValidation: boolean
  canProcess: boolean
  classifying: boolean
  validating: boolean
  processing: boolean
  reportStale: boolean
}

export function shouldPollSubmissionStatus(status: string, classificationStatus: string): boolean {
  return ACTIVE_PROCESSING_STATUSES.includes(status as typeof ACTIVE_PROCESSING_STATUSES[number])
    || classificationStatus === 'RUNNING'
}

export function shouldRefreshOnStatusChange(previous: SubmissionStatusSnapshot, next: SubmissionStatusSnapshot): boolean {
  if (previous.status === next.status && previous.classificationStatus === next.classificationStatus) {
    return false
  }

  return USER_ACTION_REFRESH_STATUSES.includes(next.status as typeof USER_ACTION_REFRESH_STATUSES[number])
    || next.classificationStatus === 'AWAITING_VALIDATION'
    || next.classificationStatus === 'VALIDATED'
}

export function resolveSubmissionNextAction(
  snapshot: SubmissionStatusSnapshot,
  options?: { hasReport?: boolean },
): SubmissionNextAction | null {
  const { status, classificationStatus } = snapshot
  const progressPercent = snapshot.progressPercent ?? 0

  const base = {
    showProgress: false,
    progressPercent,
  }

  if (classificationStatus === 'RUNNING' || status === 'CLASSIFYING') {
    return {
      ...base,
      title: 'Sınıflandırma sürüyor',
      description: 'Belge türleri ve işlem yönü hazırlanıyor. Bu sayfadan ayrılabilirsiniz; işlem arka planda devam eder.',
      cta: 'Sınıflandırma sürüyor…',
      href: '',
      loading: true,
      disabled: true,
    }
  }

  if (status === 'AWAITING_VALIDATION' || classificationStatus === 'AWAITING_VALIDATION') {
    return {
      ...base,
      title: 'Sınıflandırmayı doğrulayın',
      description: 'Belge türü önerileri, işlem yönü ve müşteri eşleşmesi onaylanmalı.',
      cta: 'Doğrulamayı tamamla',
      href: 'documents',
      loading: false,
      disabled: false,
    }
  }

  if (classificationStatus === 'VALIDATED' && status === 'UPLOADED') {
    return {
      ...base,
      title: 'Analizi başlatın',
      description: 'Sınıflandırma tamamlandı. Okuma, kurallar ve otomatik risk kontrolü çalıştırılabilir.',
      cta: 'Analizi başlat',
      href: 'documents',
      loading: false,
      disabled: false,
    }
  }

  if (ACTIVE_PROCESSING_STATUSES.includes(status as typeof ACTIVE_PROCESSING_STATUSES[number])) {
    return {
      ...base,
      title: snapshot.progressLabel ?? 'İşlem devam ediyor',
      description: snapshot.progressDescription ?? 'Analiz arka planda sürüyor.',
      cta: `İşlem devam ediyor (%${Math.round(progressPercent)})`,
      href: '',
      loading: true,
      disabled: true,
      showProgress: true,
      progressPercent,
    }
  }

  if (status === 'COMPLETED' && options?.hasReport) {
    return {
      ...base,
      title: 'Analiz tamamlandı',
      description: 'Risk raporu görüntülenebilir.',
      cta: 'Risk raporunu gör',
      href: 'report',
      loading: false,
      disabled: false,
    }
  }

  if (status === 'FAILED') {
    return {
      ...base,
      title: 'İşlem tamamlanamadı',
      description: 'Belgeleri kontrol edip analizi yeniden başlatın.',
      cta: 'Hatayı incele',
      href: 'documents',
      loading: false,
      disabled: false,
    }
  }

  if (status === 'PENDING') {
    return {
      ...base,
      title: 'Belgeleri yükleyin',
      description: 'Analiz için en az bir belge yükleyin.',
      cta: 'Belge yükle',
      href: 'documents',
      loading: false,
      disabled: false,
    }
  }

  if (status === 'UPLOADED' && classificationStatus !== 'VALIDATED') {
    return {
      ...base,
      title: 'Belgeleri sınıflandırın',
      description: 'Sistem belge türlerini okuyup önerecek; ardından doğrulama gerekir.',
      cta: 'Sınıflandırmaya git',
      href: 'documents',
      loading: false,
      disabled: false,
    }
  }

  return null
}

export function resolveDocumentWorkflowAction(params: DocumentWorkflowActionParams): DocumentWorkflowAction {
  if (params.documentCount === 0) {
    return {
      title: 'Belgeleri yükleyin',
      description: 'Belgeleri yükleyin; sistem belge türünü ve ithalat/ihracat yönünü otomatik önerecek.',
      cta: 'Belge seç',
      action: 'upload',
      disabled: false,
      loading: false,
      blockingReasons: [],
    }
  }

  if (params.classifying || params.classificationStatus === 'RUNNING' || params.submissionStatus === 'CLASSIFYING') {
    return {
      title: 'Belgeleri sistem okuyor',
      description: 'Belge türü, işlem yönü ve müşteri eşleşmesi hazırlanıyor.',
      cta: 'Okunuyor',
      action: 'classify',
      disabled: true,
      loading: true,
      blockingReasons: [],
    }
  }

  if (ACTIVE_PROCESSING_STATUSES.includes(params.submissionStatus as typeof ACTIVE_PROCESSING_STATUSES[number])) {
    return {
      title: 'Analiz sürüyor',
      description: 'Doğrulanmış belgeler üzerinden rapor üretiliyor.',
      cta: 'İşleniyor',
      action: 'process',
      disabled: true,
      loading: true,
      blockingReasons: [],
    }
  }

  if (params.classificationStatus !== 'AWAITING_VALIDATION' && params.classificationStatus !== 'VALIDATED') {
    return {
      title: 'Belgeleri sistem okusun',
      description: 'Sistem belge türünü, işlem yönünü ve müşteri eşleşmesini önerecek.',
      cta: 'Oku ve sınıflandır',
      action: 'classify',
      disabled: false,
      loading: false,
      blockingReasons: [],
    }
  }

  if (params.needsValidation) {
    return {
      title: params.reportStale ? 'Değişen belgeleri doğrulayın' : 'Önerileri doğrulayın',
      description: params.reportStale
        ? 'Yeniden analizden önce değişen veya doğrulanmamış belgeler kullanıcı tarafından onaylanmalı.'
        : 'İşlem yönü, belge türleri ve müşteri eşleşmesi kullanıcı tarafından onaylanmalı.',
      cta: params.validating ? 'Kaydediliyor' : 'Doğrulamayı kaydet',
      action: 'validate',
      disabled: params.validating,
      loading: params.validating,
      blockingReasons: [
        'İthalat/ihracat yönü seçili olmalı.',
        'Analize dahil edilen her belge için belge türü doğrulanmalı.',
      ],
    }
  }

  if (params.reportStale) {
    return {
      title: 'Yeniden analiz hazır',
      description: 'Doğrulanan belge setiyle raporu yeniden üretin.',
      cta: params.processing ? 'İşleniyor' : 'Yeniden Analiz Et',
      action: 'process',
      disabled: params.processing || !params.canProcess,
      loading: params.processing,
      blockingReasons: [],
    }
  }

  if (params.submissionStatus === 'FAILED') {
    return {
      title: 'Analizi tekrar başlatın',
      description: 'Son analiz tamamlanamadı. Doğrulanan belgelerle işlemi yeniden çalıştırabilirsiniz.',
      cta: params.processing ? 'İşleniyor' : 'Analizi tekrar başlat',
      action: 'process',
      disabled: params.processing || !params.canProcess,
      loading: params.processing,
      blockingReasons: [],
    }
  }

  return {
    title: 'Analizi başlatın',
    description: 'Doğrulanan belgeler üzerinden okuma, kurallar ve Otomatik Risk Kontrolü çalışacak.',
    cta: params.processing ? 'İşleniyor' : 'Analizi başlat',
    action: 'process',
    disabled: params.processing || !params.canProcess,
    loading: params.processing,
    blockingReasons: [],
  }
}

export function submissionResumeHref(submissionId: string, status: string, hasReport: boolean): string {
  if (status === 'COMPLETED' && hasReport) {
    return `/submissions/${submissionId}/report`
  }
  if (
    status === 'AWAITING_VALIDATION'
    || status === 'CLASSIFYING'
    || status === 'PENDING'
    || status === 'UPLOADED'
    || status === 'FAILED'
  ) {
    return `/submissions/${submissionId}/documents`
  }
  return `/submissions/${submissionId}`
}
