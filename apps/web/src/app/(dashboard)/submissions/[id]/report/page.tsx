import { getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { AlertCircle, CheckCircle, XCircle, Clock, ChevronLeft, Info } from 'lucide-react'
import OverrideButton from './override-button'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params
  const user = await getAuthenticatedUser()

  const submission = await prisma.submission.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      riskReports: { orderBy: { generatedAt: 'desc' }, take: 1 },
      ruleResults: {
        orderBy: [{ severity: 'asc' }, { ruleCode: 'asc' }],
        include: { overrides: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
    },
  })

  if (!submission) notFound()

  const report = submission.riskReports[0]
  if (!report) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Henüz rapor üretilmedi. Önce analizi başlatın.</p>
        <Link href={`/submissions/${id}`} className="mt-4 text-sm text-blue-600">
          ← Dosyaya dön
        </Link>
      </div>
    )
  }

  const errors = submission.ruleResults.filter((r) => r.result === 'FAIL')
  const warnings = submission.ruleResults.filter((r) => r.result === 'WARN')
  const reviewNeeded = submission.ruleResults.filter((r) => r.result === 'REVIEW_NEEDED')
  const passes = submission.ruleResults.filter((r) => r.result === 'PASS')

  const canOverride = ['TENANT_MANAGER', 'PLATFORM_ADMIN'].includes(user.role)

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          href={`/submissions/${id}`}
          className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {submission.title}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Risk Raporu</h1>
            <p className="mt-1 text-sm text-gray-500">
              Üretilme: {formatDateTime(report.generatedAt)}
            </p>
          </div>
          <RiskBadge errors={report.totalErrors} warnings={report.totalWarnings} />
        </div>
      </div>

      {/* AI Summary */}
      {report.summaryText && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900">AI Özeti</h3>
              <p className="mt-1 text-sm text-blue-800">{report.summaryText}</p>
              <p className="mt-2 text-xs text-blue-600">
                Not: Bu özet bilgilendirme amaçlıdır. Hukuki karar yerine geçmez.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard
          icon={<XCircle className="h-6 w-6 text-red-500" />}
          label="Hata"
          count={errors.length}
          color="red"
        />
        <StatCard
          icon={<AlertCircle className="h-6 w-6 text-yellow-500" />}
          label="Uyarı"
          count={warnings.length}
          color="yellow"
        />
        <StatCard
          icon={<Clock className="h-6 w-6 text-blue-500" />}
          label="İnceleme Gerekli"
          count={reviewNeeded.length}
          color="blue"
        />
        <StatCard
          icon={<CheckCircle className="h-6 w-6 text-green-500" />}
          label="Geçti"
          count={passes.length}
          color="green"
        />
      </div>

      {/* Rule results */}
      <div className="space-y-3">
        {[...errors, ...warnings, ...reviewNeeded, ...passes].map((result) => {
          const override = result.overrides[0]
          const sourceRefs = result.sourceRefsJson as Array<{ docType?: string; field?: string; value?: unknown }> | null

          return (
            <div
              key={result.id}
              className={`rounded-lg border bg-white p-5 ${
                result.result === 'FAIL' ? 'border-red-200' :
                result.result === 'WARN' ? 'border-yellow-200' :
                result.result === 'REVIEW_NEEDED' ? 'border-blue-200' :
                'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <ResultIcon result={result.result} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{result.ruleCode}</span>
                      <SeverityBadge severity={result.severity} />
                    </div>
                    <p className={`mt-1 text-sm font-medium ${
                      result.result === 'FAIL' ? 'text-red-900' :
                      result.result === 'WARN' ? 'text-yellow-900' :
                      result.result === 'PASS' ? 'text-green-900' :
                      'text-gray-900'
                    }`}>
                      {result.message}
                    </p>

                    {sourceRefs && sourceRefs.length > 0 && result.result !== 'PASS' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sourceRefs.map((ref, i) => (
                          <span key={i} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {ref.docType && <span className="mr-1 font-medium">{ref.docType}</span>}
                            {ref.field && <span className="text-gray-500">.{ref.field}</span>}
                            {ref.value !== undefined && <span className="ml-1 text-gray-400">= {String(ref.value)}</span>}
                          </span>
                        ))}
                      </div>
                    )}

                    {override && (
                      <div className="mt-2 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        <span className="font-medium">Geçersiz kılındı:</span> {override.reason}
                      </div>
                    )}
                  </div>
                </div>

                {canOverride && result.result !== 'PASS' && !override && (
                  <OverrideButton ruleResultId={result.id} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    red: 'bg-red-50 border-red-100',
    yellow: 'bg-yellow-50 border-yellow-100',
    blue: 'bg-blue-50 border-blue-100',
    green: 'bg-green-50 border-green-100',
  }
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color] ?? 'bg-gray-50 border-gray-100'}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{count}</p>
        </div>
      </div>
    </div>
  )
}

function RiskBadge({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-4 py-1 text-sm font-bold text-red-700">
        ⚠ {errors} Hata
      </span>
    )
  }
  if (warnings > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-4 py-1 text-sm font-bold text-yellow-700">
        {warnings} Uyarı
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-4 py-1 text-sm font-bold text-green-700">
      ✓ Temiz
    </span>
  )
}

function ResultIcon({ result }: { result: string }) {
  if (result === 'FAIL') return <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
  if (result === 'WARN') return <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-500" />
  if (result === 'REVIEW_NEEDED') return <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
  return <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    ERROR: 'bg-red-100 text-red-600',
    WARNING: 'bg-yellow-100 text-yellow-600',
    INFO: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${map[severity] ?? 'bg-gray-100 text-gray-600'}`}>
      {severity}
    </span>
  )
}
