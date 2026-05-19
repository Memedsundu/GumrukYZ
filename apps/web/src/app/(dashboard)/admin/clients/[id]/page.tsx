'use client'

import { useState, useEffect } from 'react'
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
        <p className="text-red-600">{fetchError}</p>
        <Link href="/admin/clients" className="mt-4 block text-sm text-blue-600">← Geri Dön</Link>
      </div>
    )
  }

  if (!client) {
    return <div className="p-8 text-sm text-gray-500">Yükleniyor...</div>
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link href="/admin/clients" className="mb-4 block text-sm text-gray-500 hover:text-gray-700">
          ← Müşteri Listesi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Müşteri Düzenle</h1>
        <p className="mt-1 text-sm text-gray-500">{client._count.submissions} dosya bağlı</p>
      </div>

      <div className="max-w-lg rounded-lg border border-gray-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
              Ünvan / Ad <span className="text-red-500">*</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="taxId" className="block text-sm font-medium text-gray-700">
              Vergi Kimlik Numarası
            </label>
            <input
              id="taxId"
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700">
              Ülke
            </label>
            <input
              id="country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !displayName.trim()}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </button>
            <Link
              href="/admin/clients"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              İptal
            </Link>
          </div>
        </form>

        {client._count.submissions === 0 && (
          <div className="mt-6 border-t border-gray-200 pt-5">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Siliniyor...' : 'Müşteriyi Sil'}
            </button>
            <p className="mt-1 text-xs text-gray-400">Bağlı dosyası olmayan müşteriler silinebilir.</p>
          </div>
        )}
      </div>
    </div>
  )
}
