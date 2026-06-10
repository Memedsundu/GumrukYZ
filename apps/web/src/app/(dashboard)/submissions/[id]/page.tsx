import { getAuthenticatedUser } from '@/lib/auth'
import { PageShell } from '@/components/ui/page-shell'
import { prisma } from '@gumrukyz/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { FileText, Upload, BarChart2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { getProcessingProgress } from '@/lib/processing-progress'
import { Button } from '@/components/ui/button'
import { DocTypeChip } from '@/components/ui/doc-type-chip'

interface Props {
  params: Promise<{ id: string }>
}

export default async function SubmissionDetailPage({ params }: Props) {
  const { id } = await params
  const user = await getAuthenticatedUser()

  const submission = await prisma.submission.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      documents: {
        include: { latestVersion: true },
        orderBy: { createdAt: 'asc' },
      },
      riskReports: { orderBy: { generatedAt: 'desc' }, take: 1 },
      processingJobs: { orderBy: { updatedAt: 'desc' }, take: 1 },
      brokerClient: true,
    },
  })

  if (!submission) notFound()

  const latestJob = submission.processingJobs[0]
  const latestReport = submission.riskReports[0]

  return (
    <PageShell>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-ink-muted mb-2">
          <Link href="/dashboard" className="hover:text-ink-muted">Kontrol paneli</Link>
          <span>/</span>
          <span>{submission.title}</span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold text-ink">{submission.title}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {tradeFlowLabel(submission.tradeFlow)} •{' '}
              {formatDateTime(submission.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button asChild variant="outline">
              <Link href={`/submissions/${submission.id}/documents`}>
                <Upload />
                Belge Ekle
              </Link>
            </Button>
            {latestReport && (
              <Button asChild>
                <Link href={`/submissions/${submission.id}/report`}>
                  <BarChart2 />
                  Risk Raporu
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Status card */}
        <div className="space-y-6 lg:col-span-2">
          {/* Processing status */}
          <div className="rounded-lg border border-line bg-surface p-6">
            <h2 className="mb-4 text-base font-semibold text-ink">İşlem Durumu</h2>
            <ProcessingTimeline status={submission.status} job={latestJob ?? null} />
          </div>

          {/* Documents */}
          <div className="rounded-lg border border-line bg-surface">
            <div className="border-b border-line px-6 py-4">
              <h2 className="text-base font-semibold text-ink">
                Belgeler ({submission.documents.length})
              </h2>
            </div>
            {submission.documents.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <p className="text-sm text-ink-muted">Henüz belge yüklenmedi.</p>
                <Link
                  href={`/submissions/${submission.id}/documents`}
                  className="mt-2 text-sm font-medium text-brand-600"
                >
                  Belge yükle →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {submission.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center px-6 py-4">
                    <FileText className="h-5 w-5 text-ink-subtle" />
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-ink">{doc.label}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        <span>{doc.latestVersion?.originalFilename ?? 'Dosya yok'}</span>
                        <span aria-hidden>•</span>
                        {doc.isIgnored ? <span>Yoksayıldı</span> : <DocTypeChip docType={doc.docType} />}
                      </p>
                      {doc.suggestedDocType && !doc.classificationValidatedAt && (
                        <p className="text-xs text-brand-600">
                          Öneri: {doc.suggestedDocType}
                          {doc.suggestedDocTypeConfidence != null
                            ? ` (%${Math.round(doc.suggestedDocTypeConfidence * 100)})`
                            : ''}
                        </p>
                      )}
                    </div>
                    <DocStatusIcon status={doc.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Risk summary */}
        <div className="space-y-6">
          {latestReport && (
            <div className="rounded-lg border border-line bg-surface p-6">
              <h2 className="mb-4 text-base font-semibold text-ink">Risk Özeti</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <XCircle className="mr-2 h-4 w-4 text-danger-500" />
                    <span className="text-sm text-ink-muted">Hatalar</span>
                  </div>
                  <span className="text-sm font-bold text-danger-600">{latestReport.totalErrors}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertCircle className="mr-2 h-4 w-4 text-warning-500" />
                    <span className="text-sm text-ink-muted">Uyarılar</span>
                  </div>
                  <span className="text-sm font-bold text-warning-600">{latestReport.totalWarnings}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Clock className="mr-2 h-4 w-4 text-brand-500" />
                    <span className="text-sm text-ink-muted">İnceleme Gerekli</span>
                  </div>
                  <span className="text-sm font-bold text-brand-600">{latestReport.totalReviewNeeded}</span>
                </div>
              </div>

              {latestReport.summaryText && (
                <div className="mt-4 rounded-lg bg-surface-muted p-3 text-sm text-ink-muted">
                  {latestReport.summaryText}
                </div>
              )}

              <Link
                href={`/submissions/${submission.id}/report`}
                className="mt-4 block text-center text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Tam Raporu Gör →
              </Link>
            </div>
          )}

          <div className="rounded-lg border border-line bg-surface p-6">
            <h2 className="mb-3 text-base font-semibold text-ink">Dosya Bilgileri</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Tür</dt>
                <dd className="font-medium text-ink">
                  {tradeFlowLabel(submission.tradeFlow)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Sınıflandırma</dt>
                <dd className="font-medium text-ink">
                  {classificationStatusLabel(submission.classificationStatus)}
                </dd>
              </div>
              {submission.brokerClient && (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Müşteri</dt>
                  <dd className="font-medium text-ink">{submission.brokerClient.displayName}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-muted">Belgeler</dt>
                <dd className="font-medium text-ink">{submission.documents.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Oluşturulma</dt>
                <dd className="font-medium text-ink">{formatDateTime(submission.createdAt)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

function ProcessingTimeline({ status, job }: { status: string; job: { status: string; currentStep: string | null; errorMessage: string | null; updatedAt: Date } | null }) {
  const progress = getProcessingProgress(status, job?.currentStep ?? null)
  const steps = [
    { key: 'UPLOADED', label: 'Belgeler Yüklendi' },
    { key: 'CLASSIFYING', label: 'Belge Türü Belirleniyor' },
    { key: 'AWAITING_VALIDATION', label: 'Kullanıcı Doğrulaması' },
    { key: 'EXTRACTING', label: 'Veri Çıkarılıyor' },
    { key: 'NORMALIZING', label: 'Normalleştiriliyor' },
    { key: 'RUNNING_RULES', label: 'Kurallar Çalışıyor' },
    { key: 'AI_RULE_VALIDATING', label: 'Yapay zeka kural kontrolü' },
    { key: 'GENERATING_REPORT', label: 'Rapor Üretiliyor' },
    { key: 'COMPLETED', label: 'Tamamlandı' },
  ]

  const statusOrder = [
    'PENDING', 'UPLOADED', 'CLASSIFYING', 'AWAITING_VALIDATION', 'EXTRACTING', 'NORMALIZING',
    'RUNNING_RULES', 'AI_RULE_VALIDATING', 'GENERATING_REPORT', 'COMPLETED',
  ]

  const currentIndex = statusOrder.indexOf(status)
  const isFailed = status === 'FAILED'

  return (
    <div>
      <div className="mb-5 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-700">{progress.label}</p>
            <p className="mt-0.5 text-xs text-brand-600">{progress.description}</p>
          </div>
          <span className="font-mono text-sm font-semibold text-brand-600">
            %{Math.round(progress.percent)}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => {
          const stepIndex = statusOrder.indexOf(step.key)
          const isDone = !isFailed && stepIndex <= currentIndex
          const isCurrent = !isFailed && step.key === status

          return (
            <li key={step.key} className="flex items-center gap-3">
              <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                isFailed && isCurrent ? 'bg-danger-100 text-danger-600' :
                isDone ? 'bg-success-100 text-success-600' :
                isCurrent ? 'animate-pulse-soft bg-brand-100 text-brand-600' :
                'bg-surface-muted text-ink-subtle'
              }`}>
                {isDone && !isCurrent ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${isCurrent ? 'font-medium text-ink' : isDone ? 'text-ink' : 'text-ink-subtle'}`}>
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>

      {isFailed && job?.errorMessage && (
        <div className="mt-4 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
          Hata: {job.errorMessage}
        </div>
      )}

      {status === 'PENDING' && (
        <p className="mt-4 text-sm text-ink-muted">
          Belgeleri yükleyin ve analizi başlatın.
        </p>
      )}
    </div>
  )
}

function DocStatusIcon({ status }: { status: string }) {
  if (status === 'DONE') return <CheckCircle className="h-4 w-4 text-success-500" />
  if (status === 'FAILED') return <XCircle className="h-4 w-4 text-danger-500" />
  return <Clock className="h-4 w-4 text-ink-subtle" />
}

function tradeFlowLabel(tradeFlow: string) {
  if (tradeFlow === 'IMPORT') return 'İthalat'
  if (tradeFlow === 'EXPORT') return 'İhracat'
  return 'Henüz doğrulanmadı'
}

function classificationStatusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: 'Bekliyor',
    AWAITING_VALIDATION: 'Doğrulama bekliyor',
    VALIDATED: 'Doğrulandı',
  }
  return map[status] ?? status
}
