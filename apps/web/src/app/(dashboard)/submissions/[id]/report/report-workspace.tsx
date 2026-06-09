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
import { Button } from '@/components/ui/button'
import { RiskScore } from '@/components/ui/risk-score'
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
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5">
          <Link
            href={`/submissions/${submissionId}`}
            className="mb-3 inline-flex items-center text-sm text-ink-muted hover:text-ink"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {submissionTitle}
          </Link>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-ink">Risk Raporu</h1>
                <RiskBadge counts={counts} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">Üretilme: {generatedAt}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/api/submissions/${submissionId}/report/download?format=pdf`}>
                  <Download />
                  PDF indir
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/api/submissions/${submissionId}/report/download?format=json`}>
                  <Download />
                  JSON indir
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-20 -mx-4 border-y border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] gap-2 overflow-x-auto">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => handleFilterChange(filter.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  activeFilter === filter.key
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {filter.label}
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs',
                    activeFilter === filter.key ? 'bg-white/20 text-white' : 'bg-surface-muted text-ink-subtle',
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
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="grid gap-5 lg:grid-cols-[auto_1fr_300px] lg:items-start">
                <div className="flex justify-center rounded-xl bg-canvas px-4 py-5 lg:px-6">
                  <RiskScore errors={counts.errors} warnings={counts.warnings} reviews={counts.reviewNeeded} />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Dosya durumu</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric label="Hata" value={counts.errors} tone="red" />
                    <Metric label="İnceleme gerekli" value={counts.reviewNeeded} tone="blue" />
                    <Metric label="Uyarı" value={counts.warnings} tone="amber" />
                    <Metric label="Geçti" value={counts.passes} tone="green" />
                  </div>
                  {summaryText && (
                    <div className="mt-5 rounded-xl border-l-2 border-brand-500 bg-brand-50/50 py-3 pl-4 pr-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Info className="h-4 w-4 text-brand-600" />
                        Yapay zeka özeti
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink-muted">{summaryText}</p>
                      <p className="mt-2 text-xs text-ink-subtle">
                        Bilgilendirme amaçlıdır; bağlayıcı hukuki karar yerine geçmez.
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-ai-100 bg-ai-50/60 p-4">
                  <ExpertReviewButton
                    submissionId={submissionId}
                    quota={expertQuota}
                    hasCompletedExpertReview={hasCompletedExpertReview}
                  />
                </div>
              </div>
            </section>

            {activeFilter !== 'PASS' && (
              <section className="rounded-lg border border-line bg-surface p-5 shadow-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Bulgular</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Hata, inceleme ve uyarılar tek listede gösterilir. Detay için bir bulguya tıklayın.
                    </p>
                  </div>
                  {activeCategory && (
                    <button
                      type="button"
                      onClick={() => setActiveCategory(null)}
                      className="inline-flex items-center justify-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted"
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
    <div className="min-h-48 rounded-md border border-line bg-surface-muted p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="rounded bg-surface px-2 py-0.5 text-xs font-medium text-ink-muted">{findings.length}</span>
      </div>
      {findings.length === 0 ? (
        <p className="rounded-md border border-dashed border-line bg-surface px-3 py-6 text-center text-sm text-ink-muted">
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
        'w-full rounded-md border bg-surface px-3 py-3 text-left shadow-card transition-colors hover:border-line-strong hover:bg-surface-muted',
        resultTone(finding.result).border,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ResultIcon result={finding.result} />
        <span className="font-mono text-xs text-ink-muted">{finding.code}</span>
        <ResultBadge result={finding.result} label={finding.resultLabel} />
        {finding.kind === 'expert' && <SourceTypeBadge label={finding.sourceType} />}
      </div>
      <p className="mt-2 text-sm font-semibold text-ink">{finding.title}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-muted">{finding.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span>{finding.category}</span>
        {finding.blocking && <span className="rounded bg-danger-50 px-1.5 py-0.5 font-medium text-danger-700">Bloke edebilir</span>}
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
    <section className="rounded-lg border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-ink">Geçen kontroller</h2>
          <p className="mt-1 text-sm text-ink-muted">{findings.length} kontrol geçti. Liste kapalı gelir.</p>
        </div>
        <ChevronDown className={cn('h-5 w-5 text-ink-subtle transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-line px-5 pb-5 pt-4">
          {findings.length === 0 ? (
            <p className="text-sm text-ink-muted">Bu filtrede geçen kontrol yok.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {findings.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  onClick={() => onOpenFinding(finding.id)}
                  className="rounded-md border border-line bg-surface-muted px-3 py-2 text-left hover:border-line-strong hover:bg-surface"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ResultIcon result={finding.result} />
                    <span className="font-mono text-xs text-ink-muted">{finding.code}</span>
                    <ResultBadge result={finding.result} label={finding.resultLabel} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink">{finding.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{finding.category}</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 py-6">
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
        className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p id="finding-detail-title" className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Bulgu detayı
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-muted">{finding.code}</span>
              <ResultBadge result={finding.result} label={finding.resultLabel} />
              <SourceTypeBadge label={finding.sourceType} />
              {finding.blocking && <span className="rounded bg-danger-50 px-1.5 py-0.5 text-xs font-medium text-danger-700">Bloke edebilir</span>}
              {finding.confidence !== null && (
                <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-ink-muted">
                  Güven %{Math.round(finding.confidence * 100)}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-ink">{finding.title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{finding.category} · {finding.explanation}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-ink-subtle hover:bg-surface-muted hover:text-ink-muted"
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
                      <div key={validation.id} className="rounded-md bg-ai-50 px-3 py-2 text-ai-700">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded bg-surface px-1.5 py-0.5 font-medium">{validation.statusLabel}</span>
                          <span className="text-ai-700">Güven %{Math.round(validation.confidence * 100)}</span>
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
                  <div className="overflow-x-auto rounded-md border border-line">
                    <table className="min-w-full divide-y divide-line text-left text-xs">
                      <thead className="bg-surface-muted text-ink-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">Kod</th>
                          <th className="px-3 py-2 font-medium">Güven</th>
                          <th className="px-3 py-2 font-medium">Gerekçe</th>
                          <th className="px-3 py-2 font-medium">Gerekli kanıt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line bg-surface text-ink-muted">
                        {finding.gtipCandidates.map((candidate) => (
                          <tr key={candidate.code}>
                            <td className="px-3 py-2 font-mono font-semibold text-ink">{candidate.code}</td>
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
                        className="block rounded-md border border-line bg-surface-muted px-3 py-2 hover:border-line-strong hover:bg-surface"
                      >
                        <span className="flex items-center gap-1 font-medium text-brand-700">
                          {citation.title}
                          {citation.label ? ` - ${citation.label}` : ''}
                          <ExternalLink className="h-3 w-3" />
                        </span>
                        <span className="mt-1 block text-ink-muted">{citation.excerpt}</span>
                      </a>
                    ))}
                  </div>
                </DetailBlock>
              )}

              {finding.overrideReason && (
                <div className="rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                  <span className="font-medium text-ink">Geçersiz kılındı:</span> {finding.overrideReason}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-md bg-surface-muted px-3 py-3 text-xs text-ink-muted">
                <p className="font-semibold text-ink">Kanıt</p>
                {finding.sourceRefs.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {finding.sourceRefs.map((ref, index) => (
                      <span key={`${ref}-${index}`} className="rounded bg-surface px-2 py-1 text-ink-muted">
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
      <section className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center gap-2">
          <PanelRight className="h-4 w-4 text-ink-muted" />
          <h2 className="text-sm font-semibold text-ink">Kanıt ve kaynaklar</h2>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Kategoriler</p>
          <div className="mt-2 space-y-1">
            <button
              type="button"
              onClick={() => onCategoryChange(null)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                !activeCategory ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
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
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                )}
              >
                <span>{group.category}</span>
                <span className={cn('rounded px-1.5 py-0.5 text-xs', activeCategory === group.category ? 'bg-white/15' : 'bg-surface-muted text-ink-muted')}>
                  {group.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Belgeler</p>
          <div className="mt-2 space-y-2">
            {documents.map((document) => (
              <div key={document.id} className="rounded-md border border-line px-3 py-2">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{document.filename}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {document.docType}
                      {document.isIgnored ? ' · Yoksayıldı' : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {document.extractionConfidence !== null && (
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 text-ink-muted">
                          Okuma %{Math.round(document.extractionConfidence * 100)}
                        </span>
                      )}
                      {document.classificationConfidence !== null && (
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 text-ink-muted">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Mevzuat</p>
            <div className="mt-2 space-y-2">
              {reportSources.slice(0, 6).map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md bg-surface-muted px-3 py-2 text-xs hover:bg-surface-muted"
                >
                  <span className="font-medium text-brand-700">{source.title}</span>
                  {source.label && <span className="text-ink-muted"> · {source.label}</span>}
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
    <div className="text-sm leading-6 text-ink-muted">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</p>
      {children}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'red' | 'blue' | 'amber' | 'green' }) {
  const map = {
    red: 'border-danger-100 bg-danger-50 text-danger-700',
    blue: 'border-brand-100 bg-brand-50 text-brand-700',
    amber: 'border-warning-100 bg-warning-50 text-warning-700',
    green: 'border-success-100 bg-success-50 text-success-700',
  }
  return (
    <div className={cn('rounded-xl border px-3 py-3', map[tone])}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function RiskBadge({ counts }: { counts: ReportWorkspaceProps['counts'] }) {
  if (counts.errors > 0) {
    return <span className="rounded-full bg-danger-100 px-3 py-1 text-sm font-semibold text-danger-700">{counts.errors} hata</span>
  }
  if (counts.reviewNeeded > 0) {
    return (
      <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">
        {counts.reviewNeeded} inceleme
      </span>
    )
  }
  if (counts.warnings > 0) {
    return (
      <span className="rounded-full bg-warning-100 px-3 py-1 text-sm font-semibold text-warning-700">
        {counts.warnings} uyarı
      </span>
    )
  }
  return <span className="rounded-full bg-success-100 px-3 py-1 text-sm font-semibold text-success-700">Temiz</span>
}

function ResultIcon({ result }: { result: string }) {
  if (result === 'FAIL') return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-500" />
  if (result === 'WARN') return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-500" />
  if (result === 'REVIEW_NEEDED') return <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
  return <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
}

function ResultBadge({ result, label }: { result: string; label: string }) {
  const tone = resultTone(result)
  return <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', tone.badge)}>{label}</span>
}

function SourceTypeBadge({ label }: { label: string }) {
  const isExpert = label.includes('Yapay zeka')
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium', isExpert ? 'bg-ai-50 text-ai-700' : 'bg-surface-muted text-ink-muted')}>
      {isExpert && <Sparkles className="h-3 w-3" />}
      {label}
    </span>
  )
}

function resultTone(result: string) {
  if (result === 'FAIL') {
    return {
      border: 'border-danger-200',
      badge: 'bg-danger-100 text-danger-700',
    }
  }
  if (result === 'WARN') {
    return {
      border: 'border-warning-200',
      badge: 'bg-warning-100 text-warning-700',
    }
  }
  if (result === 'REVIEW_NEEDED') {
    return {
      border: 'border-brand-200',
      badge: 'bg-brand-100 text-brand-700',
    }
  }
  return {
    border: 'border-line',
    badge: 'bg-success-100 text-success-700',
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
