'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RiskBadge } from './finding-badges'
import { CommandDeck } from './command-deck'
import { EvidencePanel } from './evidence-panel'
import { FindingDetailDialog } from './finding-detail-dialog'
import { FindingsList, PassControlsSection } from './findings-list'
import { SeverityRail, SeverityStrip } from './severity-rail'
import {
  buildCategoryCounts,
  buildReportSources,
  matchesFilter,
  sortFindings,
  type FilterKey,
} from './report-filters'
import type { ExpertQuota, ReportCounts, ReportDocumentItem, ReportFindingItem } from './report-types'

export type {
  ReportAiValidationItem,
  ReportCitationItem,
  ReportDocumentItem,
  ReportFindingItem,
  ReportGtipCandidate,
} from './report-types'

export type ReportWorkspaceProps = {
  submissionId: string
  submissionTitle: string
  generatedAt: string
  summaryText: string | null
  counts: ReportCounts
  expertQuota: ExpertQuota
  hasCompletedExpertReview: boolean
  documents: ReportDocumentItem[]
  findings: ReportFindingItem[]
}

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

  // Highest-priority blocking finding across the whole report (ignores
  // filters) — the severity rail's "next step" always points at the truth.
  const nextFinding = useMemo(
    () =>
      findings
        .filter((finding) => finding.result === 'FAIL' || finding.result === 'REVIEW_NEEDED')
        .sort(sortFindings)[0] ?? null,
    [findings],
  )

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
                <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Risk Raporu</h1>
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

        {/* Below xl the severity rail collapses to this sticky strip.
            top-16 keeps it clear of the z-30 h-16 shell topbar. */}
        <div className="sticky top-16 z-20 -mx-4 border-y border-line bg-canvas/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:hidden">
          <SeverityStrip
            filterCounts={filterCounts}
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[232px_minmax(0,1fr)_320px]">
          <aside className="hidden xl:block">
            <SeverityRail
              counts={counts}
              filterCounts={filterCounts}
              activeFilter={activeFilter}
              onFilterChange={handleFilterChange}
              nextFinding={nextFinding}
              onOpenFinding={setModalFindingId}
            />
          </aside>

          <main className="min-w-0 space-y-6">
            <CommandDeck
              counts={counts}
              summaryText={summaryText}
              submissionId={submissionId}
              expertQuota={expertQuota}
              hasCompletedExpertReview={hasCompletedExpertReview}
            />

            {activeFilter !== 'PASS' && (
              <FindingsList
                findings={issueFindings}
                activeCategory={activeCategory}
                onClearCategory={() => setActiveCategory(null)}
                onOpenFinding={setModalFindingId}
              />
            )}

            <PassControlsSection
              findings={passFindings}
              open={passesOpen}
              onToggle={() => setPassesOpen((value) => !value)}
              onOpenFinding={setModalFindingId}
            />

            {/* Evidence panel for phones/tablets: same content, disclosure form. */}
            <details className="group rounded-2xl border border-line bg-surface shadow-card xl:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                <span className="font-display text-base font-semibold text-ink">Kanıt ve kaynaklar</span>
                <ChevronDown className="h-5 w-5 text-ink-subtle transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-2 pb-2">
                <EvidencePanel
                  documents={documents}
                  categoryCounts={categoryCounts}
                  reportSources={reportSources}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                  sticky={false}
                />
              </div>
            </details>
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

      <FindingDetailDialog finding={modalFinding} onClose={() => setModalFindingId(null)} />
    </div>
  )
}
