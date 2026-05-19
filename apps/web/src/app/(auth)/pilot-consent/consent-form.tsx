'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PILOT_DISCLAIMER_VERSION } from '@/lib/pilot'

export default function PilotConsentForm() {
  const router = useRouter()
  const [accepted, setAccepted] = useState(false)
  const [realDataAck, setRealDataAck] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!accepted || !realDataAck) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/pilot-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disclaimerVersion: PILOT_DISCLAIMER_VERSION }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Onay kaydedilemedi')
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-3">
        <p>
          <strong>GümrükYZ</strong> bir gümrük beyanname ön kontrol ve risk analiz aracıdır. Hukuki
          tavsiye vermez, BİLGE / YKTS / TPS ile entegre değildir ve lisanslı gümrük müşavirinin
          yerini almaz.
        </p>
        <p>
          Bu pilot sürümde yüklediğiniz belgeler işlenmek üzere üçüncü taraf hizmet sağlayıcılarına
          aktarılabilir (ör. Vercel, Neon, OpenAI, Clerk — AB/ABD veri merkezleri). Tam KVKK uyumu ve
          Türkiye veri yerleşimi (Azure Turkey North) üretim fazında planlanmaktadır.
        </p>
        <p>
          Mümkünse <strong>anonimleştirilmiş veya sentetik</strong> belgeler kullanın. Gerçek müşteri
          belgesi yüklerseniz, işleme için gerekli hukuki dayanağın (açık rıza / sözleşme) firmada
          bulunduğunu beyan edersiniz.
        </p>
        <p className="text-xs text-gray-500">Koşul sürümü: {PILOT_DISCLAIMER_VERSION}</p>
      </div>

      <label className="flex items-start gap-3 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
        />
        <span>
          Pilot kullanım koşullarını ve yukarıdaki bilgilendirmeyi okudum, ürünün beta olduğunu ve
          bağlayıcı gümrük kararı vermediğini kabul ediyorum.
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={realDataAck}
          onChange={(e) => setRealDataAck(e.target.checked)}
          className="mt-1"
        />
        <span>
          Gerçek müşteri belgesi yüklersem, firmamın veri işleme yükümlülüklerini yerine getirdiğini
          ve yalnızca yetkili personelin erişeceğini onaylıyorum.
        </span>
      </label>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <button
        type="submit"
        disabled={!accepted || !realDataAck || loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Kaydediliyor...' : 'Kabul ediyorum ve devam et'}
      </button>
    </form>
  )
}
