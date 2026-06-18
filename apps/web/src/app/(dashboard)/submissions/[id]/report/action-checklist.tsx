'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronDown, ClipboardCheck, ExternalLink, FileUp, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResultBadge, ResultIcon, SourceTypeBadge } from './finding-badges'
import OverrideButton from './override-button'
import type { ReportFindingItem } from './report-types'

export function findingKey(finding: Pick<ReportFindingItem, 'kind' | 'id'>) {
  return `${finding.kind}:${finding.id}`
}

export function ActionChecklist({
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
  submissionId,
  documentActionsDisabled,
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
  submissionId: string
  documentActionsDisabled: boolean
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
          <p className="mt-1 text-sm text-success-700/85">Geçen kontroller risk raporunda görülebilir.</p>
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
                submissionId={submissionId}
                documentActionsDisabled={documentActionsDisabled}
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
                  submissionId={submissionId}
                  documentActionsDisabled={documentActionsDisabled}
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
  submissionId,
  documentActionsDisabled,
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
  submissionId: string
  documentActionsDisabled: boolean
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
          submissionId={submissionId}
          documentActionsDisabled={documentActionsDisabled}
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
  submissionId,
  documentActionsDisabled,
  onSaveNote,
}: {
  finding: ReportFindingItem
  notePending: boolean
  noteError?: string
  readOnly: boolean
  submissionId: string
  documentActionsDisabled: boolean
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
                  <ManageDocumentLink
                    key={document.id}
                    submissionId={submissionId}
                    documentId={document.id}
                    label={`${document.label} · ${document.filename}`}
                    disabled={documentActionsDisabled}
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

function ManageDocumentLink({
  submissionId,
  documentId,
  label,
  disabled,
}: {
  submissionId: string
  documentId: string
  label: string
  disabled: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-ink-muted">{label}</p>
        {disabled ? (
          <span className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-subtle opacity-60">
            <FileUp className="h-3.5 w-3.5" />
            Dosyayı değiştir
          </span>
        ) : (
          <Link
            href={`/submissions/${submissionId}/documents?documentId=${documentId}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted"
          >
            <FileUp className="h-3.5 w-3.5" />
            Dosyayı değiştir
          </Link>
        )}
      </div>
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

function formatCompletionDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
