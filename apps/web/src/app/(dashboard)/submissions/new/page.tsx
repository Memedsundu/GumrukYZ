'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewSubmissionPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [tradeFlow, setTradeFlow] = useState<'IMPORT' | 'EXPORT'>('IMPORT')
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
        body: JSON.stringify({ title, tradeFlow }),
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
          İthalat veya ihracat işlemi için yeni bir dosya başlatın.
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

          <div>
            <label className="block text-sm font-medium text-gray-700">İşlem Türü</label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTradeFlow('IMPORT')}
                className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                  tradeFlow === 'IMPORT'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="text-base">📥</div>
                <div>İthalat</div>
              </button>
              <button
                type="button"
                onClick={() => setTradeFlow('EXPORT')}
                className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                  tradeFlow === 'EXPORT'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="text-base">📤</div>
                <div>İhracat</div>
              </button>
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
            {loading ? 'Oluşturuluyor...' : 'Dosya Oluştur →'}
          </button>
        </form>
      </div>
    </div>
  )
}
