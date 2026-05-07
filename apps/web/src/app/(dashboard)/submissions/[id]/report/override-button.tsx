'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  ruleResultId: string
  currentResult: string
}

export default function OverrideButton({ ruleResultId, currentResult }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleOverride() {
    if (!reason.trim()) {
      setError('Geçersiz kılma nedeni zorunludur.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/rule-results/${ruleResultId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Override failed')
      }

      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Override failed')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex-shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        Geçersiz Kıl
      </button>
    )
  }

  return (
    <div className="flex-shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm w-72">
      <p className="mb-2 font-medium text-gray-700">Neden geçersiz kılıyorsunuz?</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Zorunlu açıklama..."
        rows={3}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleOverride}
          disabled={loading}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Kaydediliyor...' : 'Onayla'}
        </button>
        <button
          onClick={() => { setOpen(false); setReason(''); setError(null) }}
          className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-white"
        >
          İptal
        </button>
      </div>
    </div>
  )
}
