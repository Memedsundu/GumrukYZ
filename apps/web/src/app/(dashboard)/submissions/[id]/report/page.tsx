import { canManageTenant, getAuthenticatedUser } from '@/lib/auth'
import { prisma } from '@gumrukyz/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { AlertCircle, CheckCircle, XCircle, Clock, ChevronLeft, Info, Download } from 'lucide-react'
import {
  formatRuleResultMessage,
  formatSourceRef,
  getRuleDisplayMetadata,
  parseSourceRefs,
  recommendedActionForRuleResult,
  resultLabel,
} from '@/lib/report-format'
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
        include: {
          overrides: { orderBy: { createdAt: 'desc' }, take: 1 },
          citations: {
            include: {
              ruleLegalCitation: {
                include: { sourceDocument: true },
              },
            },
          },
          aiValidations: { orderBy: { createdAt: 'desc' } },
        },
      },
      expertReviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          findings: {
            orderBy: { createdAt: 'asc' },
            include: {
              citations: {
                include: {
                  regulationChunk: {
                    include: { sourceDocument: true },
                  },
                },
              },
            },
          },
        },
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
  const expertReview = submission.expertReviews[0] ?? null
  const expertWarnings = expertReview?.findings.filter((finding) => finding.severity === 'WARN') ?? []
  const expertReviewNeeded =
    expertReview?.findings.filter((finding) => finding.severity === 'REVIEW_NEEDED') ?? []
  const actionItems = [...errors, ...reviewNeeded, ...warnings].slice(0, 6)

  const canOverride = canManageTenant(user)

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
          <div className="flex items-center gap-3">
            <Link
              href={`/api/submissions/${id}/report/download?format=pdf`}
              className="inline-flex items-center rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="mr-2 h-4 w-4" />
              PDF indir
            </Link>
            <Link
              href={`/api/submissions/${id}/report/download?format=json`}
              className="inline-flex items-center rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="mr-2 h-4 w-4" />
              JSON indir
            </Link>
            <RiskBadge errors={report.totalErrors} warnings={report.totalWarnings} />
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {report.summaryText && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900">Yapay zeka özeti</h3>
              <p className="mt-1 text-sm text-blue-800">{report.summaryText}</p>
              <p className="mt-2 text-xs text-blue-600">
                Not: Bu özet bilgilendirme amaçlıdır. Hukuki karar yerine geçmez.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Expert Review */}
      {expertReview && (
        <div className="mb-6 rounded-lg border border-indigo-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-600" />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Yapay zeka uzman incelemesi</h3>
                {expertReview.overallRisk && (
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    Genel risk: {riskLevelLabel(expertReview.overallRisk)}
                  </span>
                )}
                {expertReview.legalContextStatus !== 'READY' && (
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {legalContextStatusLabel(expertReview.legalContextStatus)}
                  </span>
                )}
              </div>
              {expertReview.summary && (
                <p className="mt-1 text-sm text-gray-700">{expertReview.summary}</p>
              )}
              {expertReview.findings.length > 0 && (
                <div className="mt-4 space-y-3">
                  {expertReview.findings.map((finding) => (
                    <div key={finding.id} className="rounded-md border border-gray-100 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono text-gray-500">{expertAreaLabel(finding.area)}</span>
                        <ResultBadge result={finding.severity} />
                        <span className="text-xs text-gray-500">
                          Güven: %{Math.round(finding.confidence * 100)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-gray-900">{finding.title}</p>
                      <p className="mt-1 text-sm text-gray-700">{finding.explanation}</p>
                      <p className="mt-2 text-sm text-gray-700">
                        <span className="font-medium">Öneri:</span> {finding.recommendation}
                      </p>
                      {formatExpertEvidence(finding.evidenceRefsJson).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {formatExpertEvidence(finding.evidenceRefsJson).map((ref, i) => (
                            <span key={i} className="rounded bg-white px-2 py-0.5 text-xs text-gray-600">
                              {ref}
                            </span>
                          ))}
                        </div>
                      )}
                      {finding.citations.length > 0 && (
                        <div className="mt-3 space-y-2 rounded bg-white px-3 py-2 text-xs text-slate-700">
                          <p className="font-medium text-slate-900">Mevzuat dayanağı</p>
                          {finding.citations.map((citation) => {
                            const chunk = citation.regulationChunk
                            return (
                              <div key={citation.id}>
                                <a
                                  href={chunk.sourceUrl ?? chunk.sourceDocument.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-blue-700 hover:text-blue-800"
                                >
                                  {chunk.sourceDocument.title}
                                  {chunk.articleLabel ? ` - ${chunk.articleLabel}` : ''}
                                </a>
                                <p className="mt-0.5 text-slate-600">{chunk.chunkText.slice(0, 360)}</p>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-gray-500">
                Not: Yapay zeka uzman incelemesi danışma amaçlıdır; bağlayıcı hukuki görüş veya gümrük müşavirliği kararı yerine geçmez.
              </p>
            </div>
          </div>
        </div>
      )}

      {actionItems.length > 0 && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Aksiyon Özeti</h2>
          <div className="mt-3 space-y-3">
            {actionItems.map((result) => {
              const meta = getRuleDisplayMetadata(result.ruleCode)
              return (
                <div key={result.id} className="flex items-start gap-3 rounded-md bg-slate-50 px-3 py-3">
                  <ResultIcon result={result.result} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-gray-500">{result.ruleCode}</span>
                      <span className="text-xs font-medium text-gray-700">{meta.turkishTitle}</span>
                      <ResultBadge result={result.result} />
                    </div>
                    <p className="mt-1 text-sm text-gray-700">{formatRuleResultMessage(result)}</p>
                    <p className="mt-1 text-sm text-gray-900">
                      <span className="font-medium">Ne yapmalı?</span>{' '}
                      {recommendedActionForRuleResult(result.ruleCode, result.result)}
                    </p>
                  </div>
                </div>
              )
            })}
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
          count={warnings.length + expertWarnings.length}
          color="yellow"
        />
        <StatCard
          icon={<Clock className="h-6 w-6 text-blue-500" />}
          label="İnceleme Gerekli"
          count={reviewNeeded.length + expertReviewNeeded.length}
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
      <div className="space-y-6">
        {[
          { title: 'Hata', results: errors },
          { title: 'İnceleme Gerekli', results: reviewNeeded },
          { title: 'Uyarı', results: warnings },
          { title: 'Geçti', results: passes },
        ].filter((group) => group.results.length > 0).map((group) => (
          <section key={group.title}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">{group.title}</h2>
            <div className="space-y-3">
              {group.results.map((result) => {
          const override = result.overrides[0]
          const sourceRefs = parseSourceRefs(result.sourceRefsJson)
          const meta = getRuleDisplayMetadata(result.ruleCode)

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
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{meta.category}</span>
                      <ResultBadge result={result.result} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{meta.turkishTitle}</p>
                    <p className="mt-1 text-xs text-gray-500">{meta.operationalExplanation}</p>
                    <p className={`mt-1 text-sm font-medium ${
                      result.result === 'FAIL' ? 'text-red-900' :
                      result.result === 'WARN' ? 'text-yellow-900' :
                      result.result === 'PASS' ? 'text-green-900' :
                      'text-gray-900'
                    }`}>
                      {formatRuleResultMessage(result)}
                    </p>
                    <p className="mt-2 rounded bg-white px-3 py-2 text-sm text-gray-700">
                      <span className="font-medium text-gray-900">Ne yapmalı?</span>{' '}
                      {recommendedActionForRuleResult(result.ruleCode, result.result)}
                    </p>

                    {sourceRefs.length > 0 && result.result !== 'PASS' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sourceRefs.map((ref, i) => (
                          <span key={i} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {formatSourceRef(ref)}
                          </span>
                        ))}
                      </div>
                    )}

                    {result.citations.length > 0 && result.result !== 'PASS' && (
                      <div className="mt-3 space-y-2 rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <p className="font-medium text-slate-900">Mevzuat dayanağı</p>
                        {result.citations.map((citation) => {
                          const legal = citation.ruleLegalCitation
                          return (
                            <div key={citation.id}>
                              <a
                                href={legal.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-blue-700 hover:text-blue-800"
                              >
                                {legal.sourceDocument.title}
                                {legal.articleLabel ? ` - ${legal.articleLabel}` : ''}
                              </a>
                              <p className="mt-0.5 text-slate-600">{legal.excerpt}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {result.aiValidations.length > 0 && (
                      <div className="mt-3 space-y-2 rounded bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                        <p className="font-medium">Yapay zeka kural kontrolü</p>
                        {result.aiValidations.map((validation) => (
                          <div key={validation.id}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-white px-1.5 py-0.5 font-medium">
                                {aiRuleValidationLabel(validation.status)}
                              </span>
                              <span className="text-indigo-700">Güven: %{Math.round(validation.confidence * 100)}</span>
                            </div>
                            <p className="mt-1">{validation.explanation}</p>
                            <p className="mt-1"><span className="font-medium">Öneri:</span> {validation.recommendation}</p>
                          </div>
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
          </section>
        ))}
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

function ResultBadge({ result }: { result: string }) {
  const map: Record<string, string> = {
    FAIL: 'bg-red-100 text-red-600',
    WARN: 'bg-yellow-100 text-yellow-700',
    REVIEW_NEEDED: 'bg-blue-100 text-blue-700',
    PASS: 'bg-green-100 text-green-700',
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${map[result] ?? 'bg-gray-100 text-gray-600'}`}>
      {resultLabel(result)}
    </span>
  )
}

function aiRuleValidationLabel(status: string): string {
  const map: Record<string, string> = {
    LIKELY_CORRECT: 'Sonuç makul',
    POTENTIAL_FALSE_POSITIVE: 'Yanlış pozitif olabilir',
    POTENTIAL_FALSE_NEGATIVE: 'Kaçan risk olabilir',
    NEEDS_HUMAN_REVIEW: 'Manuel inceleme gerekir',
  }
  return map[status] ?? status
}

function riskLevelLabel(risk: string): string {
  const map: Record<string, string> = {
    LOW: 'Düşük',
    MEDIUM: 'Orta',
    HIGH: 'Yüksek',
    CRITICAL: 'Kritik',
  }
  return map[risk] ?? risk
}

function legalContextStatusLabel(status: string): string {
  const map: Record<string, string> = {
    READY: 'Hazır',
    MISSING_REQUIRED_SOURCE: 'Zorunlu kaynak eksik',
    EMPTY_CONTEXT: 'Mevzuat bağlamı boş',
    DISABLED: 'Devre dışı',
  }
  return map[status] ?? status
}

function expertAreaLabel(area: string): string {
  const map: Record<string, string> = {
    GTIP_PLAUSIBILITY: 'GTİP yorumu',
    PERMIT_PRODUCT_CONTROL: 'İzin / ürün kontrolü',
    REGIME_CHOICE: 'Rejim seçimi',
    VALUATION: 'Kıymet',
    ORIGIN_PREFERENTIAL: 'Menşe / tercihli rejim',
    INCOTERM: 'Incoterms',
    DOCUMENT_CONSISTENCY: 'Belge tutarlılığı',
    LEGAL_CONTEXT: 'Mevzuat kapsamı',
  }
  return map[area] ?? area
}

function formatExpertEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const ref = item as { docType?: unknown; field?: unknown; value?: unknown }
      return [ref.docType, ref.field, ref.value].filter(Boolean).join(' · ')
    })
    .filter((item): item is string => Boolean(item))
}
