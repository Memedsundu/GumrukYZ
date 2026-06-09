'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  ruleResultId: string
}

export default function OverrideButton({ ruleResultId }: Props) {
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
        throw new Error(data.error ?? 'Geçersiz kılma kaydedilemedi')
      }

      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Geçersiz kılma kaydedilemedi')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-full">
        Geçersiz Kıl
      </Button>
    )
  }

  return (
    <div className="w-full flex-shrink-0 rounded-xl border border-line bg-surface-muted p-3 text-sm">
      <p className="mb-2 font-medium text-ink">Neden geçersiz kılıyorsunuz?</p>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Zorunlu açıklama..."
        rows={3}
      />
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={handleOverride} disabled={loading}>
          {loading ? 'Kaydediliyor...' : 'Onayla'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(false)
            setReason('')
            setError(null)
          }}
        >
          İptal
        </Button>
      </div>
    </div>
  )
}
