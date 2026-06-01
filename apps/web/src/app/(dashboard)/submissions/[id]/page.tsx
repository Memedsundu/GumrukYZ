import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { FileText, Upload, BarChart2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { getProcessingProgress } from '@/lib/processing-progress'

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
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/dashboard" className="hover:text-gray-700">Kontrol paneli</Link>
          <span>/</span>
          <span>{submission.title}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{submission.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {tradeFlowLabel(submission.tradeFlow)} •{' '}
              {formatDateTime(submission.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/submissions/${submission.id}/documents`}
              className="flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Upload className="mr-2 h-4 w-4" />
              Belge Ekle
            </Link>
            {latestReport && (
              <Link
                href={`/submissions/${submission.id}/report`}
                className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <BarChart2 className="mr-2 h-4 w-4" />
                Risk Raporu
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Status card */}
        <div className="col-span-2 space-y-6">
          {/* Processing status */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">İşlem Durumu</h2>
            <ProcessingTimeline status={submission.status} job={latestJob ?? null} />
          </div>

          {/* Documents */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Belgeler ({submission.documents.length})
              </h2>
            </div>
            {submission.documents.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <p className="text-sm text-gray-500">Henüz belge yüklenmedi.</p>
                <Link
                  href={`/submissions/${submission.id}/documents`}
                  className="mt-2 text-sm font-medium text-blue-600"
                >
                  Belge yükle →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {submission.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center px-6 py-4">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">{doc.label}</p>
                      <p className="text-xs text-gray-500">
                        {doc.latestVersion?.originalFilename ?? 'Dosya yok'} •{' '}
                        {doc.isIgnored ? 'Yoksayıldı' : doc.docType}
                      </p>
                      {doc.suggestedDocType && !doc.classificationValidatedAt && (
                        <p className="text-xs text-blue-600">
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
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-gray-900">Risk Özeti</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <XCircle className="mr-2 h-4 w-4 text-red-500" />
                    <span className="text-sm text-gray-600">Hatalar</span>
                  </div>
                  <span className="text-sm font-bold text-red-600">{latestReport.totalErrors}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertCircle className="mr-2 h-4 w-4 text-yellow-500" />
                    <span className="text-sm text-gray-600">Uyarılar</span>
                  </div>
                  <span className="text-sm font-bold text-yellow-600">{latestReport.totalWarnings}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Clock className="mr-2 h-4 w-4 text-blue-500" />
                    <span className="text-sm text-gray-600">İnceleme Gerekli</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">{latestReport.totalReviewNeeded}</span>
                </div>
              </div>

              {latestReport.summaryText && (
                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  {latestReport.summaryText}
                </div>
              )}

              <Link
                href={`/submissions/${submission.id}/report`}
                className="mt-4 block text-center text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Tam Raporu Gör →
              </Link>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Dosya Bilgileri</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Tür</dt>
                <dd className="font-medium text-gray-900">
                  {tradeFlowLabel(submission.tradeFlow)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Sınıflandırma</dt>
                <dd className="font-medium text-gray-900">
                  {classificationStatusLabel(submission.classificationStatus)}
                </dd>
              </div>
              {submission.brokerClient && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Müşteri</dt>
                  <dd className="font-medium text-gray-900">{submission.brokerClient.displayName}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Belgeler</dt>
                <dd className="font-medium text-gray-900">{submission.documents.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Oluşturulma</dt>
                <dd className="font-medium text-gray-900">{formatDateTime(submission.createdAt)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
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
      <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-blue-950">{progress.label}</p>
            <p className="mt-0.5 text-xs text-blue-800">{progress.description}</p>
          </div>
          <span className="font-mono text-sm font-semibold text-blue-800">
            %{Math.round(progress.percent)}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-blue-600"
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
                isFailed && isCurrent ? 'bg-red-100 text-red-600' :
                isDone ? 'bg-green-100 text-green-600' :
                isCurrent ? 'bg-blue-100 text-blue-600' :
                'bg-gray-100 text-gray-400'
              }`}>
                {isDone && !isCurrent ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${isDone ? 'text-gray-900' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>

      {isFailed && job?.errorMessage && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Hata: {job.errorMessage}
        </div>
      )}

      {status === 'PENDING' && (
        <p className="mt-4 text-sm text-gray-500">
          Belgeleri yükleyin ve analizi başlatın.
        </p>
      )}
    </div>
  )
}

function DocStatusIcon({ status }: { status: string }) {
  if (status === 'DONE') return <CheckCircle className="h-4 w-4 text-green-500" />
  if (status === 'FAILED') return <XCircle className="h-4 w-4 text-red-500" />
  return <Clock className="h-4 w-4 text-gray-400" />
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
