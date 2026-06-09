'use client'

import { useState } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function NewSubmissionPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Dosya oluşturulamadı')
      }

      const data = await res.json() as { id: string }
      router.push(`/submissions/${data.id}/documents`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageShell size="narrow">
      <PageHeader title="Yeni dosya oluştur" description="Bir referans adı verin, ardından belgeleri yükleyin." />

      <Card className="max-w-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="title">Referans Adı</Label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: INV-2024-00123 / ABC Firması"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>
          )}

          <Button type="submit" disabled={loading || !title.trim()} className="w-full">
            {loading && <Loader2 className="animate-spin" />}
            {loading ? 'Oluşturuluyor...' : 'Yeni dosya oluştur'}
          </Button>
        </form>
      </Card>
    </PageShell>
  )
}
