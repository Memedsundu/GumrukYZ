'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewClientPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [country, setCountry] = useState('TR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, taxId: taxId || undefined, country }),
      })

      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Müşteri oluşturulamadı')

      router.push('/admin/clients')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link href="/admin/clients" className="mb-4 block text-sm text-gray-500 hover:text-gray-700">
          ← Müşteri Listesi
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Yeni Müşteri Ekle</h1>
        <p className="mt-1 text-sm text-gray-500">
          Yeni bir ithalatçı veya ihracatçı müşteri kaydı oluşturun.
        </p>
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
              placeholder="Örn: ABC Dış Ticaret A.Ş."
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
              placeholder="Örn: 1234567890"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Aynı vergi numarasıyla kayıt tekrarını önler.</p>
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
              placeholder="TR"
              maxLength={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">ISO 3166-1 alfa-2 ülke kodu (TR, DE, US…)</p>
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
              {loading ? 'Kaydediliyor...' : 'Müşteriyi Kaydet'}
            </button>
            <Link
              href="/admin/clients"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              İptal
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
