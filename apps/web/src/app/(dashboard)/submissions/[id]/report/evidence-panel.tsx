import Link from 'next/link'
import { FileText, FileUp, PanelRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportCitationItem, ReportDocumentItem } from './report-types'

export function EvidencePanel({
  documents,
  categoryCounts,
  reportSources,
  activeCategory,
  onCategoryChange,
  submissionId,
  documentActionsDisabled = false,
  sticky = true,
  framed = sticky,
}: {
  documents: ReportDocumentItem[]
  categoryCounts: Array<{ category: string; count: number }>
  reportSources: ReportCitationItem[]
  activeCategory: string | null
  onCategoryChange: (category: string | null) => void
  submissionId: string
  documentActionsDisabled?: boolean
  sticky?: boolean
  framed?: boolean
}) {
  return (
    <div className={cn('space-y-4', sticky && 'sticky top-20')}>
      <section className={cn('rounded-2xl bg-surface p-4', framed && 'border border-line shadow-card')}>
        {framed && (
          <div className="flex items-center gap-2">
            <PanelRight className="h-4 w-4 text-ink-muted" />
            <h2 className="text-sm font-semibold text-ink">Kanıt ve kaynaklar</h2>
          </div>
        )}

        <div className={cn(framed && 'mt-4')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Kategoriler</p>
          <div className="mt-2 space-y-1">
            <button
              type="button"
              onClick={() => onCategoryChange(null)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
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
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
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
                  <div className="min-w-0 flex-1">
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
                    <DocumentManageLink
                      submissionId={submissionId}
                      documentId={document.id}
                      disabled={documentActionsDisabled}
                    />
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
                  className="block rounded-md bg-surface-muted px-3 py-2 text-xs transition-colors hover:bg-line/60"
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

function DocumentManageLink({
  submissionId,
  documentId,
  disabled,
}: {
  submissionId: string
  documentId: string
  disabled: boolean
}) {
  return (
    <div className="mt-2">
      {disabled ? (
        <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-subtle opacity-60">
          <FileUp className="h-3.5 w-3.5" />
          Dosyayı değiştir
        </span>
      ) : (
        <Link
          href={`/submissions/${submissionId}/documents?documentId=${documentId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted"
        >
          <FileUp className="h-3.5 w-3.5" />
          Dosyayı değiştir
        </Link>
      )}
    </div>
  )
}
