'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PILOT_DISCLAIMER_VERSION } from '@/lib/pilot'
import { Button } from '@/components/ui/button'

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
      <div className="max-h-64 overflow-y-auto rounded-lg border border-line bg-surface-muted p-4 text-sm text-ink-muted space-y-3">
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
        <p className="text-xs text-ink-subtle">Koşul sürümü: {PILOT_DISCLAIMER_VERSION}</p>
      </div>

      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 accent-brand-600"
        />
        <span>
          Pilot kullanım koşullarını ve yukarıdaki bilgilendirmeyi okudum, ürünün beta olduğunu ve
          bağlayıcı gümrük kararı vermediğini kabul ediyorum.
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          checked={realDataAck}
          onChange={(e) => setRealDataAck(e.target.checked)}
          className="mt-1 accent-brand-600"
        />
        <span>
          Gerçek müşteri belgesi yüklersem, firmamın veri işleme yükümlülüklerini yerine getirdiğini
          ve yalnızca yetkili personelin erişeceğini onaylıyorum.
        </span>
      </label>

      {error && (
        <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
          {error}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={!accepted || !realDataAck}
        loading={loading}
      >
        {loading ? 'Kaydediliyor...' : 'Kabul ediyorum ve devam et'}
      </Button>
    </form>
  )
}
