'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  Info,
  PanelRight,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ExpertReviewButton from './expert-review-button'
import OverrideButton from './override-button'

type Quota = {
  limit: number
  used: number
  remaining: number
  usedOn: string
  period: 'DAILY'
}

export type ReportDocumentItem = {
  id: string
  filename: string
  label: string
  docType: string
  status: string
  isIgnored: boolean
  extractionConfidence: number | null
  classificationConfidence: number | null
}

export type ReportCitationItem = {
  id: string
  title: string
  label: string | null
  excerpt: string
  url: string
}

export type ReportAiValidationItem = {
  id: string
  statusLabel: string
  confidence: number
  explanation: string
  recommendation: string
}

export type ReportGtipCandidate = {
  code: string
  confidence: number
  rationale: string
  requiredEvidence: string[]
}

export type ReportFindingItem = {
  id: string
  kind: 'rule' | 'expert'
  code: string
  result: string
  resultLabel: string
  category: string
  sourceType: string
  title: string
  explanation: string
  message: string
  action: string
  blocking: boolean
  confidence: number | null
  sourceRefs: string[]
  citations: ReportCitationItem[]
  aiValidations: ReportAiValidationItem[]
  gtipCandidates: ReportGtipCandidate[]
  overrideReason: string | null
  canOverride: boolean
  defaultOpen: boolean
}

export type ReportWorkspaceProps = {
  submissionId: string
  submissionTitle: string
  generatedAt: string
  summaryText: string | null
  counts: {
    errors: number
    warnings: number
    reviewNeeded: number
    passes: number
  }
  expertQuota: Quota
  hasCompletedExpertReview: boolean
  documents: ReportDocumentItem[]
  findings: ReportFindingItem[]
}

type FilterKey = 'ALL' | 'FAIL' | 'REVIEW_NEEDED' | 'WARN' | 'EXPERT' | 'PASS'

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: 'Tüm bulgular' },
  { key: 'FAIL', label: 'Hatalar' },
  { key: 'REVIEW_NEEDED', label: 'İnceleme gerekli' },
  { key: 'WARN', label: 'Uyarılar' },
  { key: 'EXPERT', label: 'Yapay zeka' },
  { key: 'PASS', label: 'Geçen kontroller' },
]

const ISSUE_COLUMNS: Array<{ result: 'FAIL' | 'REVIEW_NEEDED' | 'WARN'; title: string; empty: string }> = [
  { result: 'FAIL', title: 'Hatalar', empty: 'Hata yok.' },
  { result: 'REVIEW_NEEDED', title: 'İnceleme gerekli', empty: 'İnceleme gerektiren bulgu yok.' },
  { result: 'WARN', title: 'Uyarılar', empty: 'Uyarı yok.' },
]

const CATEGORY_ORDER = [
  'Belge seti',
  'Belge kalitesi',
  'Fatura',
  'Çeki listesi',
  'Beyanname',
  'GTİP',
  'Menşe',
  'Kıymet',
  'Taşıma',
  'Yapay zeka',
  'Diğer',
]

export default function ReportWorkspace({
  submissionId,
  submissionTitle,
  generatedAt,
  summaryText,
  counts,
  expertQuota,
  hasCompletedExpertReview,
  documents,
  findings,
}: ReportWorkspaceProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('ALL')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [passesOpen, setPassesOpen] = useState(false)
  const [modalFindingId, setModalFindingId] = useState<string | null>(null)

  const modalFinding = findings.find((finding) => finding.id === modalFindingId) ?? null
  const categoryCounts = useMemo(() => buildCategoryCounts(findings), [findings])
  const reportSources = useMemo(() => buildReportSources(findings), [findings])

  const filterCounts = useMemo(() => ({
    ALL: findings.length,
    FAIL: findings.filter((finding) => finding.result === 'FAIL').length,
    REVIEW_NEEDED: findings.filter((finding) => finding.result === 'REVIEW_NEEDED').length,
    WARN: findings.filter((finding) => finding.result === 'WARN').length,
    EXPERT: findings.filter((finding) => finding.kind === 'expert').length,
    PASS: findings.filter((finding) => finding.result === 'PASS').length,
  }), [findings])

  const scopedFindings = useMemo(
    () => findings.filter((finding) => matchesFilter(finding, activeFilter, activeCategory)),
    [activeCategory, activeFilter, findings],
  )
  const issueFindings = scopedFindings
    .filter((finding) => finding.result !== 'PASS')
    .sort(sortFindings)
  const passFindings = scopedFindings
    .filter((finding) => finding.result === 'PASS')
    .sort(sortFindings)

  function handleFilterChange(filter: FilterKey) {
    setActiveFilter(filter)
    if (filter === 'PASS') setPassesOpen(true)
  }

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5">
          <Link
            href={`/submissions/${submissionId}`}
            className="mb-3 inline-flex items-center text-sm text-slate-500 hover:text-slate-800"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {submissionTitle}
          </Link>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Risk Raporu</h1>
                <RiskBadge counts={counts} />
              </div>
              <p className="mt-1 text-sm text-slate-500">Üretilme: {generatedAt}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/api/submissions/${submissionId}/report/download?format=pdf`}
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Download className="mr-2 h-4 w-4" />
                PDF indir
              </Link>
              <Link
                href={`/api/submissions/${submissionId}/report/download?format=json`}
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Download className="mr-2 h-4 w-4" />
                JSON indir
              </Link>
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-20 -mx-4 border-y border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] gap-2 overflow-x-auto">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => handleFilterChange(filter.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  activeFilter === filter.key
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
                )}
              >
                {filter.label}
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs',
                    activeFilter === filter.key ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {filterCounts[filter.key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="min-w-0 space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dosya durumu</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <Metric label="Hata" value={counts.errors} tone="red" />
                    <Metric label="İnceleme gerekli" value={counts.reviewNeeded} tone="blue" />
                    <Metric label="Uyarı" value={counts.warnings} tone="amber" />
                    <Metric label="Geçti" value={counts.passes} tone="green" />
                  </div>
                  {summaryText && (
                    <div className="mt-5 border-l-2 border-blue-500 pl-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Info className="h-4 w-4 text-blue-600" />
                        Yapay zeka özeti
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{summaryText}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Bilgilendirme amaçlıdır; bağlayıcı hukuki karar yerine geçmez.
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-indigo-100 bg-indigo-50/60 p-4">
                  <ExpertReviewButton
                    submissionId={submissionId}
                    quota={expertQuota}
                    hasCompletedExpertReview={hasCompletedExpertReview}
                  />
                </div>
              </div>
            </section>

            {activeFilter !== 'PASS' && (
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">Bulgular</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Hata, inceleme ve uyarılar tek listede gösterilir. Detay için bir bulguya tıklayın.
                    </p>
                  </div>
                  {activeCategory && (
                    <button
                      type="button"
                      onClick={() => setActiveCategory(null)}
                      className="inline-flex items-center justify-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Kategori filtresini temizle
                    </button>
                  )}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  {ISSUE_COLUMNS.map((column) => {
                    const columnFindings = issueFindings.filter((finding) => finding.result === column.result)
                    return (
                      <IssueColumn
                        key={column.result}
                        title={column.title}
                        empty={column.empty}
                        findings={columnFindings}
                        onOpenFinding={setModalFindingId}
                      />
                    )
                  })}
                </div>
              </section>
            )}

            <PassControlsSection
              findings={passFindings}
              open={passesOpen}
              onToggle={() => setPassesOpen((value) => !value)}
              onOpenFinding={setModalFindingId}
            />
          </main>

          <aside className="hidden xl:block">
            <EvidencePanel
              documents={documents}
              categoryCounts={categoryCounts}
              reportSources={reportSources}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
            />
          </aside>
        </div>
      </div>

      <FindingDetailModal finding={modalFinding} onClose={() => setModalFindingId(null)} />
    </div>
  )
}

function IssueColumn({
  title,
  empty,
  findings,
  onOpenFinding,
}: {
  title: string
  empty: string
  findings: ReportFindingItem[]
  onOpenFinding: (id: string) => void
}) {
  return (
    <div className="min-h-48 rounded-md border border-slate-100 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <span className="rounded bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{findings.length}</span>
      </div>
      {findings.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <div className="space-y-2">
          {findings.map((finding) => (
            <FindingSummaryCard key={finding.id} finding={finding} onOpen={() => onOpenFinding(finding.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function FindingSummaryCard({ finding, onOpen }: { finding: ReportFindingItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full rounded-md border bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50',
        resultTone(finding.result).border,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ResultIcon result={finding.result} />
        <span className="font-mono text-xs text-slate-500">{finding.code}</span>
        <ResultBadge result={finding.result} label={finding.resultLabel} />
        {finding.kind === 'expert' && <SourceTypeBadge label={finding.sourceType} />}
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-950">{finding.title}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{finding.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{finding.category}</span>
        {finding.blocking && <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">Bloke edebilir</span>}
        {finding.confidence !== null && <span>Güven %{Math.round(finding.confidence * 100)}</span>}
      </div>
    </button>
  )
}

function PassControlsSection({
  findings,
  open,
  onToggle,
  onOpenFinding,
}: {
  findings: ReportFindingItem[]
  open: boolean
  onToggle: () => void
  onOpenFinding: (id: string) => void
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-950">Geçen kontroller</h2>
          <p className="mt-1 text-sm text-slate-500">{findings.length} kontrol geçti. Liste kapalı gelir.</p>
        </div>
        <ChevronDown className={cn('h-5 w-5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          {findings.length === 0 ? (
            <p className="text-sm text-slate-500">Bu filtrede geçen kontrol yok.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {findings.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  onClick={() => onOpenFinding(finding.id)}
                  className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ResultIcon result={finding.result} />
                    <span className="font-mono text-xs text-slate-500">{finding.code}</span>
                    <ResultBadge result={finding.result} label={finding.resultLabel} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">{finding.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{finding.category}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function FindingDetailModal({ finding, onClose }: { finding: ReportFindingItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!finding) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [finding, onClose])

  if (!finding) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6">
      <button
        type="button"
        aria-label="Detay penceresini kapat"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="finding-detail-title"
        className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p id="finding-detail-title" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Bulgu detayı
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{finding.code}</span>
              <ResultBadge result={finding.result} label={finding.resultLabel} />
              <SourceTypeBadge label={finding.sourceType} />
              {finding.blocking && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">Bloke edebilir</span>}
              {finding.confidence !== null && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                  Güven %{Math.round(finding.confidence * 100)}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">{finding.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{finding.category} · {finding.explanation}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Detay penceresini kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-5 py-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-5">
              <DetailBlock title="Bulgu">
                <p>{finding.message}</p>
              </DetailBlock>
              <DetailBlock title="Ne yapmalı?">
                <p>{finding.action}</p>
              </DetailBlock>

              {finding.aiValidations.length > 0 && (
                <DetailBlock title="Yapay zeka ikinci kontrol">
                  <div className="space-y-3">
                    {finding.aiValidations.map((validation) => (
                      <div key={validation.id} className="rounded-md bg-indigo-50 px-3 py-2 text-indigo-950">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded bg-white px-1.5 py-0.5 font-medium">{validation.statusLabel}</span>
                          <span className="text-indigo-700">Güven %{Math.round(validation.confidence * 100)}</span>
                        </div>
                        <p className="mt-2">{validation.explanation}</p>
                        <p className="mt-1">
                          <span className="font-medium">Öneri:</span> {validation.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                </DetailBlock>
              )}

              {finding.gtipCandidates.length > 0 && (
                <DetailBlock title="GTİP aday yorumu">
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Kod</th>
                          <th className="px-3 py-2 font-medium">Güven</th>
                          <th className="px-3 py-2 font-medium">Gerekçe</th>
                          <th className="px-3 py-2 font-medium">Gerekli kanıt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                        {finding.gtipCandidates.map((candidate) => (
                          <tr key={candidate.code}>
                            <td className="px-3 py-2 font-mono font-semibold text-slate-950">{candidate.code}</td>
                            <td className="px-3 py-2">%{Math.round(candidate.confidence * 100)}</td>
                            <td className="px-3 py-2">{candidate.rationale}</td>
                            <td className="px-3 py-2">{candidate.requiredEvidence.join(', ') || 'Belirtilmedi'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </DetailBlock>
              )}

              {finding.citations.length > 0 && (
                <DetailBlock title="Mevzuat kaynakları">
                  <div className="space-y-3">
                    {finding.citations.map((citation) => (
                      <a
                        key={citation.id}
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-md border border-slate-100 bg-slate-50 px-3 py-2 hover:border-slate-300 hover:bg-white"
                      >
                        <span className="flex items-center gap-1 font-medium text-blue-700">
                          {citation.title}
                          {citation.label ? ` - ${citation.label}` : ''}
                          <ExternalLink className="h-3 w-3" />
                        </span>
                        <span className="mt-1 block text-slate-600">{citation.excerpt}</span>
                      </a>
                    ))}
                  </div>
                </DetailBlock>
              )}

              {finding.overrideReason && (
                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-900">Geçersiz kılındı:</span> {finding.overrideReason}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-900">Kanıt</p>
                {finding.sourceRefs.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {finding.sourceRefs.map((ref, index) => (
                      <span key={`${ref}-${index}`} className="rounded bg-white px-2 py-1 text-slate-600">
                        {ref}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2">Kaynak alan belirtilmedi.</p>
                )}
              </div>

              {finding.canOverride && <OverrideButton ruleResultId={finding.id} />}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function EvidencePanel({
  documents,
  categoryCounts,
  reportSources,
  activeCategory,
  onCategoryChange,
}: {
  documents: ReportDocumentItem[]
  categoryCounts: Array<{ category: string; count: number }>
  reportSources: ReportCitationItem[]
  activeCategory: string | null
  onCategoryChange: (category: string | null) => void
}) {
  return (
    <div className="sticky top-24 space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <PanelRight className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-950">Kanıt ve kaynaklar</h2>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kategoriler</p>
          <div className="mt-2 space-y-1">
            <button
              type="button"
              onClick={() => onCategoryChange(null)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                !activeCategory ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
              )}
            >
              <span>Tüm kategoriler</span>
            </button>
            {categoryCounts.map((group) => (
              <button
                key={group.category}
                type="button"
                onClick={() => onCategoryChange(group.category)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                  activeCategory === group.category
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
                )}
              >
                <span>{group.category}</span>
                <span className={cn('rounded px-1.5 py-0.5 text-xs', activeCategory === group.category ? 'bg-white/15' : 'bg-slate-100 text-slate-500')}>
                  {group.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Belgeler</p>
          <div className="mt-2 space-y-2">
            {documents.map((document) => (
              <div key={document.id} className="rounded-md border border-slate-100 px-3 py-2">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{document.filename}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {document.docType}
                      {document.isIgnored ? ' · Yoksayıldı' : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {document.extractionConfidence !== null && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                          Okuma %{Math.round(document.extractionConfidence * 100)}
                        </span>
                      )}
                      {document.classificationConfidence !== null && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                          Tür %{Math.round(document.classificationConfidence * 100)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {reportSources.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mevzuat</p>
            <div className="mt-2 space-y-2">
              {reportSources.slice(0, 6).map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md bg-slate-50 px-3 py-2 text-xs hover:bg-slate-100"
                >
                  <span className="font-medium text-blue-700">{source.title}</span>
                  {source.label && <span className="text-slate-500"> · {source.label}</span>}
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="text-sm leading-6 text-slate-700">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'red' | 'blue' | 'amber' | 'green' }) {
  const map = {
    red: 'border-red-100 bg-red-50 text-red-700',
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    green: 'border-green-100 bg-green-50 text-green-700',
  }
  return (
    <div className={cn('rounded-md border px-3 py-3', map[tone])}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function RiskBadge({ counts }: { counts: ReportWorkspaceProps['counts'] }) {
  if (counts.errors > 0) {
    return <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">{counts.errors} hata</span>
  }
  if (counts.reviewNeeded > 0) {
    return (
      <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
        {counts.reviewNeeded} inceleme
      </span>
    )
  }
  if (counts.warnings > 0) {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
        {counts.warnings} uyarı
      </span>
    )
  }
  return <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">Temiz</span>
}

function ResultIcon({ result }: { result: string }) {
  if (result === 'FAIL') return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
  if (result === 'WARN') return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
  if (result === 'REVIEW_NEEDED') return <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
  return <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
}

function ResultBadge({ result, label }: { result: string; label: string }) {
  const tone = resultTone(result)
  return <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', tone.badge)}>{label}</span>
}

function SourceTypeBadge({ label }: { label: string }) {
  const isExpert = label.includes('Yapay zeka')
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium', isExpert ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600')}>
      {isExpert && <Sparkles className="h-3 w-3" />}
      {label}
    </span>
  )
}

function resultTone(result: string) {
  if (result === 'FAIL') {
    return {
      border: 'border-red-200',
      badge: 'bg-red-100 text-red-700',
    }
  }
  if (result === 'WARN') {
    return {
      border: 'border-amber-200',
      badge: 'bg-amber-100 text-amber-700',
    }
  }
  if (result === 'REVIEW_NEEDED') {
    return {
      border: 'border-blue-200',
      badge: 'bg-blue-100 text-blue-700',
    }
  }
  return {
    border: 'border-slate-200',
    badge: 'bg-green-100 text-green-700',
  }
}

function matchesFilter(finding: ReportFindingItem, filter: FilterKey, category: string | null) {
  if (category && finding.category !== category) return false
  if (filter === 'ALL') return true
  if (filter === 'EXPERT') return finding.kind === 'expert'
  return finding.result === filter
}

function sortFindings(a: ReportFindingItem, b: ReportFindingItem) {
  const resultDiff = resultPriority(a.result) - resultPriority(b.result)
  if (resultDiff !== 0) return resultDiff
  const categoryDiff = categoryPriority(a.category) - categoryPriority(b.category)
  if (categoryDiff !== 0) return categoryDiff
  const sourceDiff = sourcePriority(a.kind) - sourcePriority(b.kind)
  if (sourceDiff !== 0) return sourceDiff
  return a.code.localeCompare(b.code, 'tr')
}

function resultPriority(result: string): number {
  if (result === 'FAIL') return 0
  if (result === 'REVIEW_NEEDED') return 1
  if (result === 'WARN') return 2
  return 3
}

function sourcePriority(kind: ReportFindingItem['kind']): number {
  return kind === 'expert' ? 1 : 0
}

function categoryPriority(category: string): number {
  const index = CATEGORY_ORDER.indexOf(category)
  return index === -1 ? CATEGORY_ORDER.length : index
}

function buildCategoryCounts(findings: ReportFindingItem[]) {
  const counts = new Map<string, number>()
  for (const finding of findings.filter((item) => item.result !== 'PASS')) {
    counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => categoryPriority(a.category) - categoryPriority(b.category))
}

function buildReportSources(findings: ReportFindingItem[]) {
  const sources = new Map<string, ReportCitationItem>()
  for (const citation of findings.flatMap((finding) => finding.citations)) {
    const key = `${citation.title}:${citation.label ?? ''}:${citation.url}`
    if (!sources.has(key)) sources.set(key, citation)
  }
  return [...sources.values()]
}
