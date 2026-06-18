import Link from 'next/link'
import { Info } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { ACTIVE_PROCESSING_STATUSES } from '@/lib/submission-status'
import { SubmissionNextStep } from './submission-next-step'

type Props = {
  submissionId: string
  title: string
  tradeFlow: string
  clientName: string | null
  status: string
  classificationStatus: string
  hasReport: boolean
}

/**
 * Persistent dossier-level header rendered by the submission layout. It owns the
 * identity (title, trade flow, client), the single source-of-truth status badge,
 * the one primary "next step" CTA, and the always-on legal disclaimer — so the
 * Belgeler and Aksiyonlar surfaces no longer each carry their own page header.
 */
export function DossierHeader({
  submissionId,
  title,
  tradeFlow,
  clientName,
  status,
  classificationStatus,
  hasReport,
}: Props) {
  const statusBadge = resolveStatusBadge(status, classificationStatus, hasReport)

  return (
    <header>
      <div className="mb-2 flex items-center gap-2 text-sm text-ink-muted">
        <Link href="/dashboard" className="hover:text-ink">
          Kontrol paneli
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-ink">{title}</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{tradeFlowLabel(tradeFlow)}</Badge>
            {clientName && <Badge tone="info">{clientName}</Badge>}
            <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
          </div>
          <p className="mt-2 inline-flex max-w-full items-start gap-1.5 text-xs leading-5 text-ink-subtle">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Bilgilendirme amaçlıdır; bağlayıcı hukuki karar yerine geçmez.</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SubmissionNextStep
            submissionId={submissionId}
            initialStatus={status}
            initialClassificationStatus={classificationStatus}
            hasReport={hasReport}
            variant="header-button"
            poll={false}
          />
        </div>
      </div>
    </header>
  )
}

function tradeFlowLabel(tradeFlow: string): string {
  if (tradeFlow === 'IMPORT') return 'İthalat'
  if (tradeFlow === 'EXPORT') return 'İhracat'
  return 'Yön belirlenmedi'
}

function resolveStatusBadge(
  status: string,
  classificationStatus: string,
  hasReport: boolean,
): { label: string; tone: BadgeTone } {
  if (status === 'FAILED') return { label: 'Başarısız', tone: 'danger' }
  if (status === 'COMPLETED') return { label: 'Tamamlandı', tone: 'success' }
  if (classificationStatus === 'RUNNING' || status === 'CLASSIFYING') {
    return { label: 'Sınıflandırılıyor', tone: 'info' }
  }
  if (ACTIVE_PROCESSING_STATUSES.includes(status as (typeof ACTIVE_PROCESSING_STATUSES)[number])) {
    return { label: 'Analiz ediliyor', tone: 'info' }
  }
  if (status === 'AWAITING_VALIDATION' || classificationStatus === 'AWAITING_VALIDATION') {
    return { label: 'Doğrulama bekliyor', tone: 'warning' }
  }
  if (status === 'UPLOADED' && classificationStatus === 'VALIDATED') {
    return { label: 'Analize hazır', tone: 'info' }
  }
  if (hasReport) return { label: 'Rapor hazır', tone: 'success' }
  return { label: 'Belge bekleniyor', tone: 'neutral' }
}
