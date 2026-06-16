'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function ReconcileButton() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setMessage(null)
    try {
      const res = await fetch('/api/platform/reconcile', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { reconciled?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Eşitleme başarısız')
      setMessage(`${data.reconciled ?? 0} rezervasyon eşitlendi.`)
      router.refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Hata')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message ? <span className="text-xs text-ink-muted">{message}</span> : null}
      <Button variant="outline" size="sm" onClick={run} loading={running}>
        Bekleyen rezervasyonları eşitle
      </Button>
    </div>
  )
}
