import { FileText, FileUp, Loader2, PanelRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportCitationItem, ReportDocumentItem } from './report-types'

export function EvidencePanel({
  documents,
  categoryCounts,
  reportSources,
  activeCategory,
  onCategoryChange,
  onReplaceDocument,
  replacingDocumentIds = new Set(),
  replaceErrors = {},
  replacementDisabled = false,
  sticky = true,
  framed = sticky,
}: {
  documents: ReportDocumentItem[]
  categoryCounts: Array<{ category: string; count: number }>
  reportSources: ReportCitationItem[]
  activeCategory: string | null
  onCategoryChange: (category: string | null) => void
  onReplaceDocument?: (documentId: string, file: File) => void
  replacingDocumentIds?: Set<string>
  replaceErrors?: Record<string, string>
  replacementDisabled?: boolean
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
                    {onReplaceDocument && (
                      <ReplaceDocumentButton
                        documentId={document.id}
                        pending={replacingDocumentIds.has(document.id)}
                        error={replaceErrors[document.id]}
                        disabled={replacementDisabled}
                        onReplace={onReplaceDocument}
                      />
                    )}
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

function ReplaceDocumentButton({
  documentId,
  pending,
  error,
  disabled,
  onReplace,
}: {
  documentId: string
  pending: boolean
  error?: string
  disabled: boolean
  onReplace: (documentId: string, file: File) => void
}) {
  const inputId = `evidence-replace-${documentId}`

  return (
    <div className="mt-2">
      <label
        htmlFor={inputId}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted',
          (pending || disabled) && 'pointer-events-none cursor-not-allowed opacity-50',
        )}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
        Dosyayı değiştir
      </label>
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
