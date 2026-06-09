'use client'

import { useState, useEffect } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'

interface Client {
  id: string
  displayName: string
  taxId: string | null
  country: string | null
  _count: { submissions: number }
}

export default function EditClientPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [country, setCountry] = useState('TR')
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadClient() {
      try {
        const res = await fetch(`/api/clients/${id}`)
        if (!active) return
        if (!res.ok) {
          setFetchError('Müşteri bulunamadı')
          return
        }

        const data = await res.json() as { client: Client }
        if (!active) return
        setClient(data.client)
        setDisplayName(data.client.displayName)
        setTaxId(data.client.taxId ?? '')
        setCountry(data.client.country ?? 'TR')
      } catch {
        if (active) setFetchError('Müşteri yüklenemedi')
      }
    }

    void loadClient()

    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, taxId: taxId || null, country }),
      })

      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Güncelleme başarısız')

      router.push('/admin/clients')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Bu müşteriyi silmek istediğinize emin misiniz?')) return
    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Silme başarısız')
      router.push('/admin/clients')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu')
      setDeleting(false)
    }
  }

  if (fetchError) {
    return (
      <div className="p-8">
        <p className="text-danger-600">{fetchError}</p>
        <Link href="/admin/clients" className="mt-4 block text-sm text-brand-600">← Geri Dön</Link>
      </div>
    )
  }

  if (!client) {
    return <div className="p-8 text-sm text-ink-muted">Yükleniyor...</div>
  }

  return (
    <PageShell size="narrow">
      <div className="mb-8">
        <Link href="/admin/clients" className="mb-4 block text-sm text-ink-muted hover:text-ink-muted">
          ← Müşteri Listesi
        </Link>
        <h1 className="text-2xl font-bold text-ink">Müşteri Düzenle</h1>
        <p className="mt-1 text-sm text-ink-muted">{client._count.submissions} dosya bağlı</p>
      </div>

      <div className="max-w-lg rounded-lg border border-line bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-ink-muted">
              Ünvan / Ad <span className="text-danger-500">*</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              required
            />
          </div>

          <div>
            <label htmlFor="taxId" className="block text-sm font-medium text-ink-muted">
              Vergi Kimlik Numarası
            </label>
            <input
              id="taxId"
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="country" className="block text-sm font-medium text-ink-muted">
              Ülke
            </label>
            <input
              id="country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={3}
              className="mt-1 block w-full rounded-lg border border-line-strong px-3 py-2 text-sm uppercase focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !displayName.trim()}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </button>
            <Link
              href="/admin/clients"
              className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted"
            >
              İptal
            </Link>
          </div>
        </form>

        {client._count.submissions === 0 && (
          <div className="mt-6 border-t border-line pt-5">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg border border-danger-200 px-4 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Siliniyor...' : 'Müşteriyi Sil'}
            </button>
            <p className="mt-1 text-xs text-ink-subtle">Bağlı dosyası olmayan müşteriler silinebilir.</p>
          </div>
        )}
      </div>
    </PageShell>
  )
}
