import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResultBadge, ResultIcon, SourceTypeBadge, resultTone } from './finding-badges'
import type { ReportFindingItem } from './report-types'

const SEVERITY_GROUPS: Array<{ result: 'FAIL' | 'REVIEW_NEEDED' | 'WARN'; title: string }> = [
  { result: 'FAIL', title: 'Hatalar' },
  { result: 'REVIEW_NEEDED', title: 'İnceleme gerekli' },
  { result: 'WARN', title: 'Uyarılar' },
]

/**
 * Single prioritized column: blocking findings always render first, severity
 * group headers mark the boundaries. Replaces the old 3-column board.
 */
export function FindingsList({
  findings,
  activeCategory,
  onClearCategory,
  onOpenFinding,
}: {
  findings: ReportFindingItem[]
  activeCategory: string | null
  onClearCategory: () => void
  onOpenFinding: (id: string) => void
}) {
  // Stagger entrance by overall priority order, capped so the whole
  // sequence stays within ~400ms.
  const delayById = new Map(
    SEVERITY_GROUPS
      .flatMap((group) => findings.filter((finding) => finding.result === group.result))
      .map((finding, index) => [finding.id, Math.min(index, 5) * 60] as const),
  )

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Bulgular</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Önce engelleyici bulgular gösterilir. Detay için bir bulguya tıklayın.
          </p>
        </div>
        {activeCategory && (
          <button
            type="button"
            onClick={onClearCategory}
            className="inline-flex items-center justify-center rounded-md border border-line px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted"
          >
            Kategori filtresini temizle
          </button>
        )}
      </div>

      {findings.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-line bg-surface-muted px-3 py-8 text-center text-sm text-ink-muted">
          Bu filtrede bulgu yok.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {SEVERITY_GROUPS.map((group) => {
            const groupFindings = findings.filter((finding) => finding.result === group.result)
            if (groupFindings.length === 0) return null
            return (
              <div key={group.result}>
                <div className="flex items-center gap-2 border-b border-line pb-2">
                  <ResultIcon result={group.result} />
                  <h3 className="text-sm font-semibold text-ink">{group.title}</h3>
                  <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
                    {groupFindings.length}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {groupFindings.map((finding) => (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      animationDelay={delayById.get(finding.id) ?? 0}
                      onOpen={() => onOpenFinding(finding.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function FindingRow({
  finding,
  animationDelay,
  onOpen,
}: {
  finding: ReportFindingItem
  animationDelay: number
  onOpen: () => void
}) {
  const tone = resultTone(finding.result)
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ animationDelay: `${animationDelay}ms` }}
      className={cn(
        'w-full animate-fade-rise rounded-md border border-l-2 bg-surface px-4 py-3 text-left shadow-card transition-colors hover:border-line-strong hover:bg-surface-muted',
        tone.border,
        tone.accent,
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
        {finding.blocking && (
          <span className="rounded bg-danger-50 px-1.5 py-0.5 font-medium text-danger-700">Bloke edebilir</span>
        )}
        {finding.confidence !== null && <span>Güven %{Math.round(finding.confidence * 100)}</span>}
      </div>
    </button>
  )
}

export function PassControlsSection({
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
    <section className="rounded-2xl border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Geçen kontroller</h2>
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
                  className="rounded-md border border-line bg-surface-muted px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface"
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
