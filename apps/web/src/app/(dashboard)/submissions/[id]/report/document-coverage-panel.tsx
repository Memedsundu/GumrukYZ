'use client'

import Link from 'next/link'
import { FileWarning } from 'lucide-react'
import type { DocumentCoverageResult } from '@gumrukyz/domain'

export function DocumentCoveragePanel({
  coverage,
  submissionId,
}: {
  coverage: DocumentCoverageResult
  submissionId?: string
}) {
  if (coverage.isComplete && coverage.missingConditional.length === 0 && coverage.missingReferencedInvoices.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Belge kapsamı</h2>
        <p className="mt-2 text-sm text-ink-muted">{coverage.limitationNotice}</p>
        <p className="mt-3 text-xs text-ink-subtle">
          Mevcut belgeler: {coverage.presentLabels.join(', ') || '—'}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-warning-200 bg-warning-50 p-5 shadow-card">
      <div className="flex items-start gap-3">
        <FileWarning className="mt-0.5 size-5 shrink-0 text-warning-700" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-warning-700">Belge kapsamı</h2>
          <p className="mt-2 text-sm leading-6 text-warning-700">{coverage.limitationNotice}</p>
          <div className="mt-4 space-y-3 text-sm text-ink">
            <div>
              <p className="font-medium text-ink">Mevcut belgeler</p>
              <p className="mt-1 text-ink-muted">
                {coverage.presentLabels.length > 0 ? coverage.presentLabels.join(', ') : 'Henüz beklenen belge seti tamamlanmadı.'}
              </p>
            </div>
            {coverage.missingExpectedLabels.length > 0 && (
              <div>
                <p className="font-medium text-ink">Eksik beklenen belgeler</p>
                <p className="mt-1 text-ink-muted">{coverage.missingExpectedLabels.join(', ')}</p>
              </div>
            )}
            {coverage.missingConditionalLabels.length > 0 && (
              <div>
                <p className="font-medium text-ink">Koşullu eksik belgeler</p>
                <p className="mt-1 text-ink-muted">{coverage.missingConditionalLabels.join(', ')}</p>
              </div>
            )}
            {coverage.missingReferencedInvoiceLabels.length > 0 && (
              <div>
                <p className="font-medium text-ink">Eksik referans faturalar</p>
                <p className="mt-1 text-ink-muted">{coverage.missingReferencedInvoiceLabels.join(', ')}</p>
              </div>
            )}
          </div>
          {submissionId && (
            <Link
              href={`/submissions/${submissionId}/documents?focus=upload`}
              className="mt-4 inline-flex items-center rounded-md border border-warning-300 bg-warning-50 px-3 py-1.5 text-xs font-semibold text-warning-700 transition-colors hover:bg-warning-100"
            >
              Eksik belge ekle
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

export function DocumentCoverageWarning({
  missingExpectedLabels,
}: {
  missingExpectedLabels: string[]
}) {
  if (missingExpectedLabels.length === 0) return null

  return (
    <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
      <p className="font-medium">Eksik beklenen belgeler</p>
      <p className="mt-1 leading-6">{missingExpectedLabels.join(', ')}</p>
      <p className="mt-2 text-xs text-warning-700/90">
        Analiz yine de başlatılabilir; sonuçlar mevcut belgelerle sınırlı olacaktır.
      </p>
    </div>
  )
}
