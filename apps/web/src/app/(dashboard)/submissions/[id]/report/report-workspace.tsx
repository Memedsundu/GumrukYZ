'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileUp,
  Info,
  Loader2,
  MessageCircleQuestion,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RiskScore } from '@/components/ui/risk-score'
import { cn } from '@/lib/utils'
import { Metric, ResultBadge, ResultIcon, RiskBadge, SourceTypeBadge } from './finding-badges'
import { EvidencePanel } from './evidence-panel'
import { FindingDetailDialog } from './finding-detail-dialog'
import { PassControlsSection } from './findings-list'
import OverrideButton from './override-button'
import ExpertReviewButton from './expert-review-button'
import { SuggestionChips } from './suggestion-chips'
import { AssistantChat, type ChatMessage } from './assistant-chat'
import { DocumentCoveragePanel } from './document-coverage-panel'
import { buildCategoryCounts, buildReportSources, sortFindings } from './report-filters'
import type { DocumentCoverageResult } from '@gumrukyz/domain'
import type {
  ExpertQuota,
  ReportChecklistState,
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
  submissionTitle: string
  generatedAt: string
  counts: ReportCounts
  expertQuota: ExpertQuota
  hasCompletedExpertReview: boolean
  documents: ReportDocumentItem[]
  findings: ReportFindingItem[]
  reportState: ReportState
  /** Whether replacing a document and re-running analysis will consume a credit. */
  willChargeReanalysis: boolean
  documentCoverage: DocumentCoverageResult
}

type ChecklistResponse = ReportChecklistState & {
  findingKind: ReportFindingItem['kind']
  findingId: string
  error?: string
}

export default function ReportWorkspace({
  submissionId,
  submissionTitle,
  generatedAt,
  counts,
  expertQuota,
  hasCompletedExpertReview,
  documents,
  findings,
  reportState,
  willChargeReanalysis,
  documentCoverage,
}: ReportWorkspaceProps) {
  const [items, setItems] = useState(findings)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())
  const prevFindingKeysRef = useRef<Set<string>>(new Set(findings.map(findingKey)))
  const findingsSignature = useMemo(
    () => findings.map((finding) => `${finding.kind}:${finding.id}:${finding.result}`).join('|'),
    [findings],
  )

  useEffect(() => {
    const prevKeys = prevFindingKeysRef.current
    const newDefaultOpenKeys = findings
      .filter((finding) => !prevKeys.has(findingKey(finding)) && finding.defaultOpen)
      .map(findingKey)

    setItems(findings)
    prevFindingKeysRef.current = new Set(findings.map(findingKey))

    if (newDefaultOpenKeys.length > 0) {
      setExpandedKeys((current) => {
        const next = new Set(current)
        for (const key of newDefaultOpenKeys) next.add(key)
        return next
      })
    }
  }, [findingsSignature, findings])

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [passesOpen, setPassesOpen] = useState(false)
  const [modalFindingId, setModalFindingId] = useState<string | null>(null)
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notePendingKeys, setNotePendingKeys] = useState<Set<string>>(() => new Set())
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({})
  const [replacingDocumentIds, setReplacingDocumentIds] = useState<Set<string>>(() => new Set())
  const [replaceErrors, setReplaceErrors] = useState<Record<string, string>>({})
  const [replaceMessage, setReplaceMessage] = useState<string | null>(null)

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

  const modalFinding = items.find((finding) => finding.id === modalFindingId) ?? null
  const categoryCounts = useMemo(() => buildCategoryCounts(items), [items])
  const reportSources = useMemo(() => buildReportSources(items), [items])
  const actionableFindings = useMemo(
    () => items.filter((finding) => finding.result !== 'PASS').sort(sortFindings),
    [items],
  )
  const filteredActionableFindings = useMemo(
    () => actionableFindings.filter((finding) => !activeCategory || finding.category === activeCategory),
    [actionableFindings, activeCategory],
  )
  const incompleteFindings = filteredActionableFindings.filter((finding) => !finding.checklist.completedAt)
  const completedFindings = filteredActionableFindings.filter((finding) => Boolean(finding.checklist.completedAt))
  const completedCount = actionableFindings.filter((finding) => finding.checklist.completedAt).length
  const progressPercent = actionableFindings.length === 0
    ? 100
    : Math.round((completedCount / actionableFindings.length) * 100)
  const expertReviewRecommended = counts.errors > 0 || counts.reviewNeeded > 0 || counts.warnings >= 2

  function toggleExpanded(key: string) {
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function toggleChecklist(finding: ReportFindingItem, completed: boolean) {
    if (reportState.readonly) return
    const key = findingKey(finding)
    const previousChecklist = finding.checklist
    const optimisticChecklist: ReportChecklistState = {
      ...previousChecklist,
      completedAt: completed ? new Date().toISOString() : null,
      completedByEmail: completed ? 'Kaydediliyor' : null,
    }

    setPendingKeys((current) => new Set(current).add(key))
    setErrors((current) => omitKey(current, key))
    setItems((current) => replaceChecklist(current, finding, optimisticChecklist))

    try {
      const response = await fetch(`/api/submissions/${submissionId}/report/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingKind: finding.kind,
          findingId: finding.id,
          completed,
        }),
      })
      const payload = await response.json().catch(() => null) as ChecklistResponse | null
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? 'Kontrol listesi güncellenemedi')
      }

      setItems((current) => replaceChecklist(current, finding, {
        completedAt: payload.completedAt,
        completedByEmail: payload.completedByEmail,
        note: payload.note,
      }))
    } catch (error) {
      setItems((current) => replaceChecklist(current, finding, previousChecklist))
      setErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : 'Kontrol listesi güncellenemedi',
      }))
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  async function saveChecklistNote(finding: ReportFindingItem, note: string) {
    if (reportState.readonly) return
    const key = findingKey(finding)
    const previousChecklist = finding.checklist
    const normalizedNote = note.trim() || null

    setNotePendingKeys((current) => new Set(current).add(key))
    setNoteErrors((current) => omitKey(current, key))
    setItems((current) => replaceChecklist(current, finding, {
      ...previousChecklist,
      note: normalizedNote,
    }))

    try {
      const response = await fetch(`/api/submissions/${submissionId}/report/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingKind: finding.kind,
          findingId: finding.id,
          note: normalizedNote,
        }),
      })
      const payload = await response.json().catch(() => null) as ChecklistResponse | null
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? 'Not kaydedilemedi')
      }

      setItems((current) => replaceChecklist(current, finding, {
        completedAt: payload.completedAt,
        completedByEmail: payload.completedByEmail,
        note: payload.note,
      }))
    } catch (error) {
      setItems((current) => replaceChecklist(current, finding, previousChecklist))
      setNoteErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : 'Not kaydedilemedi',
      }))
    } finally {
      setNotePendingKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  async function replaceDocument(documentId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)

    setReplacingDocumentIds((current) => new Set(current).add(documentId))
    setReplaceErrors((current) => omitKey(current, documentId))
    setReplaceMessage(null)

    try {
      const response = await fetch(`/api/submissions/${submissionId}/documents/${documentId}/versions`, {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json().catch(() => null) as {
        needsValidation?: boolean
        processingJobId?: string
        processingError?: string
        error?: string
      } | null
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? 'Dosya değiştirilemedi')
      }

      if (payload.processingError) {
        setReplaceMessage(`Dosya değiştirildi, ancak analiz başlatılamadı: ${payload.processingError}`)
      } else if (payload.needsValidation) {
        setReplaceMessage('Dosya değiştirildi. Yeniden analiz için belge sınıflandırmasını doğrulayın.')
      } else {
        setReplaceMessage('Dosya değiştirildi. Rapor yeniden analiz ediliyor.')
      }
      window.setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      setReplaceErrors((current) => ({
        ...current,
        [documentId]: error instanceof Error ? error.message : 'Dosya değiştirilemedi',
      }))
    } finally {
      setReplacingDocumentIds((current) => {
        const next = new Set(current)
        next.delete(documentId)
        return next
      })
    }
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
                <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Aksiyon listesi</h1>
                <RiskBadge counts={counts} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">Risk Raporu · Üretilme: {generatedAt}</p>
              <p className="mt-2 inline-flex max-w-full items-start gap-1.5 text-xs leading-5 text-ink-subtle">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Bilgilendirme amaçlıdır; bağlayıcı hukuki karar yerine geçmez.</span>
              </p>
              {!reportState.readonly && (
                <p className="mt-1 text-xs text-ink-subtle">
                  {willChargeReanalysis
                    ? 'Belge değiştirip yeniden analiz başlatmak 1 analiz hakkı kullanır.'
                    : 'Bu dosyada yeniden analiz ücretsizdir.'}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-muted">
                <ClipboardCheck className="h-4 w-4 text-brand-600" />
                {completedCount}/{actionableFindings.length} tamamlandı
              </span>
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

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="min-w-0 space-y-6">
            <ReportStateBanner reportState={reportState} submissionId={submissionId} message={replaceMessage} />

            <DocumentCoveragePanel coverage={documentCoverage} />

            <ChecklistOverview
              counts={counts}
              completedCount={completedCount}
              totalCount={actionableFindings.length}
              progressPercent={progressPercent}
            />

            <ActionChecklist
              incompleteFindings={incompleteFindings}
              completedFindings={completedFindings}
              totalCount={actionableFindings.length}
              activeCategory={activeCategory}
              expandedKeys={expandedKeys}
              pendingKeys={pendingKeys}
              errors={errors}
              notePendingKeys={notePendingKeys}
              noteErrors={noteErrors}
              readOnly={reportState.readonly}
              onReplaceDocument={replaceDocument}
              replacingDocumentIds={replacingDocumentIds}
              replaceErrors={replaceErrors}
              replacementDisabled={Boolean(reportState.activeJobId)}
              onClearCategory={() => setActiveCategory(null)}
              onExpandedChange={toggleExpanded}
              onToggle={toggleChecklist}
              onSaveNote={saveChecklistNote}
            />

            <div className="space-y-4 xl:hidden">
              <ExpertReviewCard
                submissionId={submissionId}
                expertQuota={expertQuota}
                hasCompletedExpertReview={hasCompletedExpertReview}
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
                    onReplaceDocument={replaceDocument}
                    replacingDocumentIds={replacingDocumentIds}
                    replaceErrors={replaceErrors}
                    replacementDisabled={Boolean(reportState.activeJobId)}
                  />
                </div>
              </details>
            </div>

            <PassControlsSection
              findings={items.filter((finding) => finding.result === 'PASS').sort(sortFindings)}
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
                onReplaceDocument={replaceDocument}
                replacingDocumentIds={replacingDocumentIds}
                replaceErrors={replaceErrors}
                replacementDisabled={Boolean(reportState.activeJobId)}
              />
            </div>
          </aside>
        </div>
      </div>

      <FindingDetailDialog finding={modalFinding} onClose={() => setModalFindingId(null)} />

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

function ReportStateBanner({
  reportState,
  submissionId,
  message,
}: {
  reportState: ReportState
  submissionId: string
  message: string | null
}) {
  if (!reportState.stale && !message) return null

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">
              {reportState.activeJobId ? 'Rapor yeniden analiz ediliyor' : 'Rapor güncel belge setini yansıtmıyor'}
            </p>
            <p className="mt-1 text-amber-800">
              {message ?? reportState.staleReason ?? 'Belge değişikliği tamamlandıktan sonra rapor yenilenecek.'}
            </p>
          </div>
        </div>

        {reportState.validationRequired && (
          <Button asChild variant="outline" size="sm" className="shrink-0 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100">
            <Link href={`/submissions/${submissionId}/documents`}>Sınıflandırmayı doğrula</Link>
          </Button>
        )}
      </div>
    </section>
  )
}

function ChecklistOverview({
  counts,
  completedCount,
  totalCount,
  progressPercent,
}: {
  counts: ReportCounts
  completedCount: number
  totalCount: number
  progressPercent: number
}) {
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

        <div className="flex min-w-0 flex-col justify-center gap-4">
          <div className="flex justify-end">
            <div className="w-full min-w-[160px] max-w-[220px]">
              <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
                <span>İlerleme</span>
                <span>{completedCount}/{totalCount}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

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

function ReplaceDocumentControl({
  documentId,
  label,
  pending,
  error,
  disabled,
  onReplace,
}: {
  documentId: string
  label: string
  pending: boolean
  error?: string
  disabled: boolean
  onReplace: (documentId: string, file: File) => void
}) {
  const inputId = `replace-${documentId}`

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-ink-muted">{label}</p>
        <label
          htmlFor={inputId}
          className={cn(
            'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted',
            (pending || disabled) && 'pointer-events-none cursor-not-allowed opacity-50',
          )}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
          Dosyayı değiştir
        </label>
      </div>
      <input
        id={inputId}
        type="file"
        className="sr-only"
        disabled={pending || disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onReplace(documentId, file)
        }}
      />
      {error && <p className="mt-1 text-xs text-danger-700">{error}</p>}
    </div>
  )
}

function ActionChecklist({
  incompleteFindings,
  completedFindings,
  totalCount,
  activeCategory,
  expandedKeys,
  pendingKeys,
  errors,
  notePendingKeys,
  noteErrors,
  readOnly,
  onReplaceDocument,
  replacingDocumentIds,
  replaceErrors,
  replacementDisabled,
  onClearCategory,
  onExpandedChange,
  onToggle,
  onSaveNote,
}: {
  incompleteFindings: ReportFindingItem[]
  completedFindings: ReportFindingItem[]
  totalCount: number
  activeCategory: string | null
  expandedKeys: Set<string>
  pendingKeys: Set<string>
  errors: Record<string, string>
  notePendingKeys: Set<string>
  noteErrors: Record<string, string>
  readOnly: boolean
  onReplaceDocument: (documentId: string, file: File) => void
  replacingDocumentIds: Set<string>
  replaceErrors: Record<string, string>
  replacementDisabled: boolean
  onClearCategory: () => void
  onExpandedChange: (key: string) => void
  onToggle: (finding: ReportFindingItem, completed: boolean) => void
  onSaveNote: (finding: ReportFindingItem, note: string) => void
}) {
  const visibleCount = incompleteFindings.length + completedFindings.length

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand-600" />
            <h2 className="font-display text-xl font-semibold text-ink">Yapılacaklar</h2>
          </div>
        </div>

        {activeCategory && (
          <button
            type="button"
            onClick={onClearCategory}
            className="inline-flex items-center justify-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted"
          >
            {activeCategory} filtresini temizle
          </button>
        )}
      </div>

      {totalCount === 0 ? (
        <div className="mt-5 rounded-xl border border-success-200 bg-success-50 px-4 py-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success-600" />
          <p className="mt-3 font-display text-base font-semibold text-success-700">Aksiyon gerektiren bulgu yok</p>
          <p className="mt-1 text-sm text-success-700/85">Geçen kontroller sayfanın altında kapalı olarak tutulur.</p>
        </div>
      ) : visibleCount === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line bg-surface-muted px-3 py-8 text-center text-sm text-ink-muted">
          Bu kategori için açık aksiyon bulunmuyor.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          <ChecklistGroup title="Açık işler" count={incompleteFindings.length}>
            {incompleteFindings.map((finding) => (
              <ChecklistItem
                key={findingKey(finding)}
                finding={finding}
                expanded={expandedKeys.has(findingKey(finding))}
                pending={pendingKeys.has(findingKey(finding))}
                error={errors[findingKey(finding)]}
                notePending={notePendingKeys.has(findingKey(finding))}
                noteError={noteErrors[findingKey(finding)]}
                readOnly={readOnly}
                onReplaceDocument={onReplaceDocument}
                replacingDocumentIds={replacingDocumentIds}
                replaceErrors={replaceErrors}
                replacementDisabled={replacementDisabled}
                onExpandedChange={() => onExpandedChange(findingKey(finding))}
                onToggle={(completed) => onToggle(finding, completed)}
                onSaveNote={(note) => onSaveNote(finding, note)}
              />
            ))}
          </ChecklistGroup>

          {completedFindings.length > 0 && (
            <ChecklistGroup title="Tamamlananlar" count={completedFindings.length} completed>
              {completedFindings.map((finding) => (
                <ChecklistItem
                  key={findingKey(finding)}
                  finding={finding}
                  expanded={expandedKeys.has(findingKey(finding))}
                  pending={pendingKeys.has(findingKey(finding))}
                  error={errors[findingKey(finding)]}
                  notePending={notePendingKeys.has(findingKey(finding))}
                  noteError={noteErrors[findingKey(finding)]}
                  readOnly={readOnly}
                  onReplaceDocument={onReplaceDocument}
                  replacingDocumentIds={replacingDocumentIds}
                  replaceErrors={replaceErrors}
                  replacementDisabled={replacementDisabled}
                  onExpandedChange={() => onExpandedChange(findingKey(finding))}
                  onToggle={(completed) => onToggle(finding, completed)}
                  onSaveNote={(note) => onSaveNote(finding, note)}
                />
              ))}
            </ChecklistGroup>
          )}
        </div>
      )}
    </section>
  )
}

function ChecklistGroup({
  title,
  count,
  completed = false,
  children,
}: {
  title: string
  count: number
  completed?: boolean
  children: ReactNode
}) {
  if (count === 0 && !completed) {
    return (
      <div className="rounded-xl border border-dashed border-success-200 bg-success-50 px-4 py-5 text-sm text-success-700">
        Açık iş kalmadı. Tamamlanan işler aşağıda erişilebilir.
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">{count}</span>
      </div>
      <div className={cn('space-y-3', completed && 'opacity-90')}>{children}</div>
    </div>
  )
}

function ChecklistItem({
  finding,
  expanded,
  pending,
  error,
  notePending,
  noteError,
  readOnly,
  onReplaceDocument,
  replacingDocumentIds,
  replaceErrors,
  replacementDisabled,
  onExpandedChange,
  onToggle,
  onSaveNote,
}: {
  finding: ReportFindingItem
  expanded: boolean
  pending: boolean
  error?: string
  notePending: boolean
  noteError?: string
  readOnly: boolean
  onReplaceDocument: (documentId: string, file: File) => void
  replacingDocumentIds: Set<string>
  replaceErrors: Record<string, string>
  replacementDisabled: boolean
  onExpandedChange: () => void
  onToggle: (completed: boolean) => void
  onSaveNote: (note: string) => void
}) {
  const completed = Boolean(finding.checklist.completedAt)

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border transition-colors',
        completed ? 'border-line bg-surface-muted/60' : 'border-line bg-surface hover:border-line-strong',
        expanded && 'border-line-strong shadow-card',
      )}
    >
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-[28px_minmax(0,1fr)]">
        <div className="pt-1">
          <input
            type="checkbox"
            checked={completed}
            disabled={pending || readOnly}
            onChange={(event) => onToggle(event.target.checked)}
            aria-label={`${finding.title} tamamlandı`}
            className="h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500 disabled:cursor-wait disabled:opacity-60"
          />
          {pending && <Loader2 className="mt-2 h-4 w-4 animate-spin text-ink-subtle" />}
        </div>

        <button
          type="button"
          onClick={onExpandedChange}
          aria-expanded={expanded}
          className="min-w-0 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cn('text-base font-semibold text-ink', completed && 'text-ink-muted line-through decoration-line-strong')}>
                {finding.title}
              </p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-muted">{finding.action}</p>
            </div>
            <span
              className={cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-muted text-ink-muted transition-colors',
                'hover:border-line-strong hover:bg-surface',
                expanded && 'border-brand-200 bg-brand-50 text-brand-700',
              )}
            >
              <ChevronDown className={cn('h-5 w-5 transition-transform', expanded && 'rotate-180')} />
            </span>
          </div>

          {expanded && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ResultIcon result={finding.result} />
              <span className="font-mono text-xs text-ink-muted">{finding.code}</span>
              <ResultBadge result={finding.result} label={finding.resultLabel} />
              <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-ink-muted">
                {finding.category}
              </span>
              {finding.kind === 'expert' && <SourceTypeBadge label={finding.sourceType} />}
              {finding.blocking && (
                <span className="rounded bg-danger-50 px-1.5 py-0.5 text-xs font-medium text-danger-700">
                  Bloke edebilir
                </span>
              )}
            </div>
          )}

          {completed && (
            <p className="mt-2 text-xs text-success-700">
              Tamamlandı
              {finding.checklist.completedByEmail ? `: ${finding.checklist.completedByEmail}` : ''}
              {finding.checklist.completedAt ? ` · ${formatCompletionDate(finding.checklist.completedAt)}` : ''}
            </p>
          )}
        </button>
      </div>

      {error && (
        <p className="border-t border-danger-100 bg-danger-50 px-4 py-2 text-sm text-danger-700">{error}</p>
      )}

      {expanded && (
        <ChecklistDetails
          finding={finding}
          notePending={notePending}
          noteError={noteError}
          readOnly={readOnly}
          onReplaceDocument={onReplaceDocument}
          replacingDocumentIds={replacingDocumentIds}
          replaceErrors={replaceErrors}
          replacementDisabled={replacementDisabled}
          onSaveNote={onSaveNote}
        />
      )}
    </article>
  )
}

function ChecklistDetails({
  finding,
  notePending,
  noteError,
  readOnly,
  onReplaceDocument,
  replacingDocumentIds,
  replaceErrors,
  replacementDisabled,
  onSaveNote,
}: {
  finding: ReportFindingItem
  notePending: boolean
  noteError?: string
  readOnly: boolean
  onReplaceDocument: (documentId: string, file: File) => void
  replacingDocumentIds: Set<string>
  replaceErrors: Record<string, string>
  replacementDisabled: boolean
  onSaveNote: (note: string) => void
}) {
  return (
    <div className="border-t border-line bg-canvas/50 px-4 py-4">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="space-y-5">
          <DetailBlock title="Sorun">
            <p>{finding.message}</p>
          </DetailBlock>

          <DetailBlock title="Neden önemli">
            <p>{finding.explanation}</p>
          </DetailBlock>

          <DetailBlock title="Nasıl tamamlanır?">
            <p>{finding.action}</p>
          </DetailBlock>

          <ChecklistNote
            key={`${finding.kind}:${finding.id}:${finding.checklist.note ?? ''}`}
            note={finding.checklist.note}
            pending={notePending}
            error={noteError}
            readOnly={readOnly}
            onSave={onSaveNote}
          />

          {finding.summaryExplanation && (
            <DetailBlock title="Otomatik Risk Kontrolü açıklaması">
              <p className="rounded-md bg-ai-50 px-3 py-2 text-ai-700">{finding.summaryExplanation}</p>
            </DetailBlock>
          )}

          {finding.aiValidations.length > 0 && (
            <DetailBlock title="Otomatik Risk Kontrolü doğrulaması">
              <div className="space-y-3">
                {finding.aiValidations.map((validation) => (
                  <div key={validation.id} className="rounded-md bg-ai-50 px-3 py-2 text-ai-700">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-surface px-1.5 py-0.5 font-medium">{validation.statusLabel}</span>
                      <span>Güven %{Math.round(validation.confidence * 100)}</span>
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
                    className="block rounded-md border border-line bg-surface px-3 py-2 transition-colors hover:border-line-strong hover:bg-surface-muted"
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
        </div>

        <aside className="space-y-4">
          <div className="rounded-md bg-surface px-3 py-3 text-xs text-ink-muted">
            <p className="font-semibold text-ink">Kanıt / kaynak alanları</p>
            {finding.sourceRefs.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {finding.sourceRefs.map((ref, index) => (
                  <span key={`${ref}-${index}`} className="rounded bg-surface-muted px-2 py-1 text-ink-muted">
                    {ref}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2">Kaynak alan belirtilmedi.</p>
            )}
          </div>

          {finding.confidence !== null && (
            <div className="rounded-md bg-surface px-3 py-3 text-xs text-ink-muted">
              <p className="font-semibold text-ink">Güven</p>
              <p className="mt-1">%{Math.round(finding.confidence * 100)}</p>
            </div>
          )}

          {finding.sourceDocuments.length > 0 && (
            <div className="rounded-md bg-surface px-3 py-3 text-xs text-ink-muted">
              <p className="font-semibold text-ink">Dosya düzeltme</p>
              <div className="mt-2 space-y-2">
                {finding.sourceDocuments.map((document) => (
                  <ReplaceDocumentControl
                    key={document.id}
                    documentId={document.id}
                    label={`${document.label} · ${document.filename}`}
                    pending={replacingDocumentIds.has(document.id)}
                    error={replaceErrors[document.id]}
                    disabled={replacementDisabled}
                    onReplace={onReplaceDocument}
                  />
                ))}
              </div>
            </div>
          )}

          {finding.canOverride && <OverrideButton ruleResultId={finding.id} />}
        </aside>
      </div>
    </div>
  )
}

function ChecklistNote({
  note,
  pending,
  error,
  readOnly,
  onSave,
}: {
  note: string | null
  pending: boolean
  error?: string
  readOnly: boolean
  onSave: (note: string) => void
}) {
  const [value, setValue] = useState(note ?? '')
  const savedValue = note ?? ''
  const normalizedValue = value.trim()
  const normalizedSavedValue = savedValue.trim()
  const dirty = normalizedValue !== normalizedSavedValue

  return (
    <DetailBlock title="Kısa açıklama">
      <div className="rounded-md border border-line bg-surface px-3 py-3">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, 500))}
          rows={3}
          maxLength={500}
          placeholder="Ekip notu ekleyin"
          disabled={readOnly}
          className="min-h-20 w-full resize-y bg-transparent text-sm leading-6 text-ink outline-none placeholder:text-ink-subtle"
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-ink-subtle">{value.length}/500</span>
          <button
            type="button"
            onClick={() => onSave(value)}
            disabled={!dirty || pending || readOnly}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-danger-700">{error}</p>}
      </div>
    </DetailBlock>
  )
}

function ExpertReviewCard({
  submissionId,
  expertQuota,
  hasCompletedExpertReview,
  recommended,
}: {
  submissionId: string
  expertQuota: ExpertQuota
  hasCompletedExpertReview: boolean
  recommended: boolean
}) {
  return (
    <section className="rounded-2xl border border-ai-100 bg-ai-50/60 p-4 shadow-card">
      <ExpertReviewButton
        submissionId={submissionId}
        quota={expertQuota}
        hasCompletedExpertReview={hasCompletedExpertReview}
        recommended={recommended}
      />
    </section>
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

function replaceChecklist(
  findings: ReportFindingItem[],
  target: ReportFindingItem,
  checklist: ReportChecklistState,
) {
  return findings.map((finding) => (
    finding.kind === target.kind && finding.id === target.id
      ? { ...finding, checklist }
      : finding
  ))
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}

function findingKey(finding: Pick<ReportFindingItem, 'kind' | 'id'>) {
  return `${finding.kind}:${finding.id}`
}

function formatCompletionDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
