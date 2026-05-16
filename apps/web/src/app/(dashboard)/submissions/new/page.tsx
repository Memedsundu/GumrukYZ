'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DATA_CLASSIFICATION_OPTIONS = [
  {
    value: 'SYNTHETIC',
    label: 'Sentetik',
    description: 'Test/demo verisi. Gerçek müşteri bilgisi içermiyor.',
    color: 'border-green-300 bg-green-50',
    badge: 'bg-green-100 text-green-700',
  },
  {
    value: 'REDACTED',
    label: 'Anonimleştirilmiş',
    description: 'Kişisel/gizli veriler maskelenmiş.',
    color: 'border-blue-300 bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    value: 'REAL',
    label: 'Gerçek Veri',
    description: 'Gerçek müşteri belgesi. Yalnızca yetkili kullanım.',
    color: 'border-orange-300 bg-orange-50',
    badge: 'bg-orange-100 text-orange-700',
  },
] as const

type DataClassification = 'SYNTHETIC' | 'REDACTED' | 'REAL'

export default function NewSubmissionPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [dataClassification, setDataClassification] = useState<DataClassification>('SYNTHETIC')
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
        body: JSON.stringify({ title, dataClassification }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Submission creation failed')
      }

      const data = await res.json() as { id: string }
      router.push(`/submissions/${data.id}/documents`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Yeni Dosya Oluştur</h1>
        <p className="mt-1 text-sm text-gray-500">
          Belgeleri yükleyin; sistem belge türünü ve ithalat/ihracat yönünü otomatik önerecek.
        </p>
      </div>

      <div className="max-w-lg rounded-lg border border-gray-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Referans Adı
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: INV-2024-00123 / ABC Firması"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          {/* Data Classification */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Veri Sınıflandırması <span className="text-red-500">*</span>
            </label>
            <p className="mt-0.5 text-xs text-gray-500">
              KVKK ve veri güvenliği politikasına göre bu dosyanın veri türünü belirtin.
            </p>
            <div className="mt-2 space-y-2">
              {DATA_CLASSIFICATION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-colors ${
                    dataClassification === opt.value
                      ? opt.color
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="dataClassification"
                    value={opt.value}
                    checked={dataClassification === opt.value}
                    onChange={() => setDataClassification(opt.value)}
                    className="mt-0.5 h-4 w-4 text-blue-600"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${opt.badge}`}>
                        {opt.value}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Oluşturuluyor...' : 'Dosyayı Oluştur →'}
          </button>
        </form>
      </div>
    </div>
  )
}
