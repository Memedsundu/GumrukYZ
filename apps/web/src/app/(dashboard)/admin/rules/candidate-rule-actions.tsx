'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

type SourceOption = {
  id: string
  title: string
}

export function ExtractCandidateRulesForm({ sources }: { sources: SourceOption[] }) {
  const router = useRouter()
  const [sourceDocumentId, setSourceDocumentId] = useState(sources[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleExtract() {
    if (!sourceDocumentId) return
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/admin/candidate-rules/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId }),
      })
      const data = await res.json() as {
        error?: string
        createdCount?: number
        skippedCodes?: string[]
      }
      if (!res.ok) {
        throw new Error(data.error ?? 'Aday kural çıkarımı başarısız oldu')
      }
      const skipped = data.skippedCodes?.length
        ? ` (${data.skippedCodes.length} aday mevcut kodlarla çakıştığı için atlandı)`
        : ''
      setMessage(`${data.createdCount ?? 0} aday kural oluşturuldu${skipped}.`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aday kural çıkarımı başarısız oldu')
    } finally {
      setLoading(false)
    }
  }

  if (sources.length === 0) return null

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-sm font-medium text-ink">Mevzuattan aday kural çıkar</p>
      <p className="mt-0.5 text-xs text-ink-muted">
        Seçilen kaynak belge yapay zeka ile taranır ve taslak kural adayları oluşturulur. Adaylar
        onaylansa bile motorda kod karşılığı eklenene kadar çalışmaz.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <select
          value={sourceDocumentId}
          onChange={(e) => setSourceDocumentId(e.target.value)}
          disabled={loading}
          className="h-9 flex-1 rounded-md border border-line bg-white px-2 text-sm text-ink"
        >
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.title}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={handleExtract} disabled={loading || !sourceDocumentId}>
          {loading ? 'Çıkarılıyor...' : 'Aday Kural Çıkar'}
        </Button>
      </div>
      {message && <p className="mt-2 text-xs text-success-600">{message}</p>}
      {error && <p className="mt-2 text-xs text-danger-600">{error}</p>}
    </div>
  )
}

export function CandidateRuleReviewActions({ candidateId }: { candidateId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleReview(action: 'approve' | 'reject') {
    setLoading(action)
    setError(null)

    try {
      const res = await fetch(`/api/admin/candidate-rules/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'İşlem kaydedilemedi')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem kaydedilemedi')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => handleReview('approve')}
          disabled={loading !== null}
        >
          {loading === 'approve' ? 'Onaylanıyor...' : 'Onayla'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleReview('reject')}
          disabled={loading !== null}
        >
          {loading === 'reject' ? 'Reddediliyor...' : 'Reddet'}
        </Button>
      </div>
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  )
}
