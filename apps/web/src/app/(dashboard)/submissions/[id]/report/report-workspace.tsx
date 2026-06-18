'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Download, MessageCircleQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RiskScore } from '@/components/ui/risk-score'
import { Metric, RiskBadge } from './finding-badges'
import { EvidencePanel } from './evidence-panel'
import { FindingDetailDialog } from './finding-detail-dialog'
import { FindingsList, PassControlsSection } from './findings-list'
import ExpertReviewButton from './expert-review-button'
import { SuggestionChips } from './suggestion-chips'
import { AssistantChat, type ChatMessage } from './assistant-chat'
import { DocumentCoveragePanel } from './document-coverage-panel'
import { buildCategoryCounts, buildReportSources, sortFindings } from './report-filters'
import type { DocumentCoverageResult } from '@gumrukyz/domain'
import type {
  ExpertQuota,
  ReportCounts,
  ReportDocumentItem,
  ReportFindingItem,
  ReportState,
} from './report-types'

export type {
  ReportAiValidationItem,
  ReportCitationItem,
  ReportDocumentItem,
  ReportFindingItem,
  ReportGtipCandidate,
} from './report-types'

export type ReportWorkspaceProps = {
  submissionId: string
  generatedAt: string
  counts: ReportCounts
  expertQuota: ExpertQuota
  hasCompletedExpertReview: boolean
  expertReviewStatusMessage: string | null
  documents: ReportDocumentItem[]
  findings: ReportFindingItem[]
  reportState: ReportState
  /** Whether replacing a document and re-running analysis will consume a credit. */
  willChargeReanalysis: boolean
  documentCoverage: DocumentCoverageResult
}

/**
 * Risk Raporu — the read/understand surface. Risk score, rule findings grouped by
 * category, document coverage, evidence/sources, expert review, downloads, and the
 * assistant. Working the findings (checklist, notes, override) lives on the separate
 * Aksiyon Listesi tab.
 */
export default function ReportWorkspace({
  submissionId,
  generatedAt,
  counts,
  expertQuota,
  hasCompletedExpertReview,
  expertReviewStatusMessage,
  documents,
  findings,
  reportState,
  willChargeReanalysis,
  documentCoverage,
}: ReportWorkspaceProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [passesOpen, setPassesOpen] = useState(false)
  const [modalFindingId, setModalFindingId] = useState<string | null>(null)

  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantMessages, setAssistantMessages] = useState<ChatMessage[]>([])
  const [assistantSending, setAssistantSending] = useState(false)
  const [assistantError, setAssistantError] = useState<string | null>(null)

  async function askAssistant(prompt: string) {
    const content = prompt.trim()
    if (!content || assistantSending) return
    const history: ChatMessage[] = [...assistantMessages, { role: 'user', content }]
    setAssistantOpen(true)
    setAssistantError(null)
    setAssistantMessages(history)
    setAssistantSending(true)
    try {
      const res = await fetch(`/api/submissions/${submissionId}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string }
      if (!res.ok || !data.answer) {
        throw new Error(data.error ?? 'Asistan yanıtı alınamadı.')
      }
      setAssistantMessages((prev) => [...prev, { role: 'assistant', content: data.answer as string }])
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : 'Asistan yanıtı alınamadı.')
    } finally {
      setAssistantSending(false)
    }
  }

  const categoryCounts = useMemo(() => buildCategoryCounts(findings), [findings])
  const reportSources = useMemo(() => buildReportSources(findings), [findings])
  const actionableFindings = useMemo(
    () => findings.filter((finding) => finding.result !== 'PASS').sort(sortFindings),
    [findings],
  )
  const filteredActionableFindings = useMemo(
    () => actionableFindings.filter((finding) => !activeCategory || finding.category === activeCategory),
    [actionableFindings, activeCategory],
  )
  const passes = useMemo(
    () => findings.filter((finding) => finding.result === 'PASS').sort(sortFindings),
    [findings],
  )
  const modalFinding = findings.find((finding) => finding.id === modalFindingId) ?? null
  const expertReviewRecommended = counts.errors > 0 || counts.reviewNeeded > 0 || counts.warnings >= 2

  return (
    <div>
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Risk Raporu</h2>
                <RiskBadge counts={counts} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">Üretilme: {generatedAt}</p>
              {!reportState.readonly && (
                <p className="mt-1 text-xs text-ink-subtle">
                  {willChargeReanalysis
                    ? 'Belge değiştirip yeniden analiz başlatmak 1 analiz hakkı kullanır.'
                    : 'Bu dosyada yeniden analiz ücretsizdir.'}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="text-ink-muted">
                <Link href={`/api/submissions/${submissionId}/report/download?format=pdf`}>
                  <Download />
                  PDF indir
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="text-ink-muted">
                <Link href={`/api/submissions/${submissionId}/report/download?format=json`}>
                  <Download />
                  JSON indir
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="min-w-0 space-y-6">
            <RiskSummary counts={counts} />

            <DocumentCoveragePanel coverage={documentCoverage} submissionId={submissionId} />

            <FindingsList
              findings={filteredActionableFindings}
              activeCategory={activeCategory}
              onClearCategory={() => setActiveCategory(null)}
              onOpenFinding={setModalFindingId}
            />

            <div className="space-y-4 xl:hidden">
              <ExpertReviewCard
                submissionId={submissionId}
                expertQuota={expertQuota}
                hasCompletedExpertReview={hasCompletedExpertReview}
                expertReviewStatusMessage={expertReviewStatusMessage}
                recommended={expertReviewRecommended}
              />
              <SuggestionChips
                submissionId={submissionId}
                onSelectPrompt={(suggestion) => askAssistant(suggestion.prompt_to_assistant)}
              />
              <details className="group rounded-2xl border border-line bg-surface shadow-card">
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
                    submissionId={submissionId}
                    documentActionsDisabled={Boolean(reportState.activeJobId)}
                  />
                </div>
              </details>
            </div>

            <PassControlsSection
              findings={passes}
              open={passesOpen}
              onToggle={() => setPassesOpen((value) => !value)}
              onOpenFinding={setModalFindingId}
            />
          </main>

          <aside className="hidden xl:block">
            <div className="sticky top-20 space-y-5">
              <ExpertReviewCard
                submissionId={submissionId}
                expertQuota={expertQuota}
                hasCompletedExpertReview={hasCompletedExpertReview}
                expertReviewStatusMessage={expertReviewStatusMessage}
                recommended={expertReviewRecommended}
              />
              <SuggestionChips
                submissionId={submissionId}
                onSelectPrompt={(suggestion) => askAssistant(suggestion.prompt_to_assistant)}
              />
              <EvidencePanel
                documents={documents}
                categoryCounts={categoryCounts}
                reportSources={reportSources}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                sticky={false}
                framed
                submissionId={submissionId}
                documentActionsDisabled={Boolean(reportState.activeJobId)}
              />
            </div>
          </aside>
        </div>
      </div>

      <FindingDetailDialog finding={modalFinding} onClose={() => setModalFindingId(null)} readOnly />

      {!assistantOpen && (
        <button
          type="button"
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-pop transition-colors hover:bg-brand-700"
        >
          <MessageCircleQuestion className="size-5" />
          Dosya asistanına sor
        </button>
      )}

      <AssistantChat
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        messages={assistantMessages}
        sending={assistantSending}
        error={assistantError}
        onSend={askAssistant}
      />
    </div>
  )
}

function RiskSummary({ counts }: { counts: ReportCounts }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-5 lg:items-stretch">
        <div className="flex flex-col items-center justify-center rounded-xl bg-canvas px-2 py-3 lg:px-4 lg:py-5">
          <RiskScore
            errors={counts.errors}
            warnings={counts.warnings}
            reviews={counts.reviewNeeded}
            size={88}
            className="lg:hidden"
          />
          <RiskScore
            errors={counts.errors}
            warnings={counts.warnings}
            reviews={counts.reviewNeeded}
            className="hidden lg:flex"
          />
        </div>

        <div className="flex min-w-0 flex-col justify-center">
          <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
            <Metric label="Hata" value={counts.errors} tone="red" />
            <Metric label="İnceleme gerekli" value={counts.reviewNeeded} tone="blue" />
            <Metric label="Uyarı" value={counts.warnings} tone="amber" />
            <Metric label="Geçti" value={counts.passes} tone="green" />
          </div>
        </div>
      </div>
    </section>
  )
}

function ExpertReviewCard({
  submissionId,
  expertQuota,
  hasCompletedExpertReview,
  expertReviewStatusMessage,
  recommended,
}: {
  submissionId: string
  expertQuota: ExpertQuota
  hasCompletedExpertReview: boolean
  expertReviewStatusMessage: string | null
  recommended: boolean
}) {
  return (
    <section className="rounded-2xl border border-ai-100 bg-ai-50/60 p-4 shadow-card">
      {expertReviewStatusMessage && (
        <div className="mb-3 rounded-lg border border-ai-100 bg-white/70 px-3 py-2 text-xs leading-5 text-ai-700">
          {expertReviewStatusMessage}
        </div>
      )}
      <ExpertReviewButton
        submissionId={submissionId}
        quota={expertQuota}
        hasCompletedExpertReview={hasCompletedExpertReview}
        recommended={recommended}
      />
    </section>
  )
}
