import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ResultBadge, SourceTypeBadge } from './finding-badges'
import OverrideButton from './override-button'
import type { ReportFindingItem } from './report-types'

export function FindingDetailDialog({
  finding,
  onClose,
  readOnly = false,
}: {
  finding: ReportFindingItem | null
  onClose: () => void
  /** Hide action controls (override) — used on the read-only Risk Raporu surface. */
  readOnly?: boolean
}) {
  return (
    <Dialog open={finding !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        {finding && (
          <>
            <DialogHeader className="pr-12">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Bulgu detayı
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink-muted">{finding.code}</span>
                <ResultBadge result={finding.result} label={finding.resultLabel} />
                <SourceTypeBadge label={finding.sourceType} />
                {finding.blocking && (
                  <span className="rounded bg-danger-50 px-1.5 py-0.5 text-xs font-medium text-danger-700">
                    Bloke edebilir
                  </span>
                )}
                {finding.confidence !== null && (
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-ink-muted">
                    Güven %{Math.round(finding.confidence * 100)}
                  </span>
                )}
              </div>
              <DialogTitle className="mt-2 text-lg">{finding.title}</DialogTitle>
              <p className="mt-1 text-sm text-ink-muted">
                {finding.category} · {finding.explanation}
              </p>
            </DialogHeader>

            <DialogBody>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-5">
                  <DetailBlock title="Bulgu">
                    <p>{finding.message}</p>
                  </DetailBlock>
                  <DetailBlock title="Ne yapmalı?">
                    <p>{finding.action}</p>
                  </DetailBlock>

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

                  {finding.canOverride && !readOnly && <OverrideButton ruleResultId={finding.id} />}
                </div>
              </div>
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
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
