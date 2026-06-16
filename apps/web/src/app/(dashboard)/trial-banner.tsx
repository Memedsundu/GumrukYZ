'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Sparkles, X } from 'lucide-react'
import type { EntitlementsState } from '@/lib/entitlements'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const WARNING_DAYS = 3

function shouldShow(entitlement: EntitlementsState): boolean {
  if (entitlement.readOnly) return true
  if (!entitlement.isTrial) return false
  const daysLeft = entitlement.trial?.daysLeft ?? 99
  return daysLeft <= WARNING_DAYS || entitlement.warnings.length > 0
}

export function TrialBanner({ entitlement }: { entitlement: EntitlementsState | null }) {
  const [dismissed, setDismissed] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)

  if (!entitlement || !shouldShow(entitlement)) return null

  const isBlocked = entitlement.readOnly
  // A blocked banner cannot be dismissed.
  if (dismissed && !isBlocked) return null

  async function requestUpgrade() {
    setRequesting(true)
    try {
      const res = await fetch('/api/sales-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'upgrade' }),
      })
      if (res.ok) setRequested(true)
    } finally {
      setRequesting(false)
    }
  }

  const trial = entitlement.trial
  const message = isBlocked
    ? blockedMessage(entitlement.blockReason)
    : trial
      ? `Deneme sürümü: ${trial.daysLeft} gün kaldı · ${trial.analysisUsed}/${trial.analysisCap} analiz kullanıldı.`
      : 'Kullanım limitinize yaklaşıyorsunuz.'

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-sm sm:px-6',
        isBlocked
          ? 'border-danger-200 bg-danger-50 text-danger-700'
          : 'border-warning-200 bg-warning-50 text-warning-700',
      )}
      role={isBlocked ? 'alert' : 'status'}
    >
      <div className="flex items-center gap-2">
        {isBlocked ? (
          <AlertTriangle className="size-4 shrink-0" />
        ) : (
          <Sparkles className="size-4 shrink-0" />
        )}
        <span className="font-medium">{message}</span>
      </div>
      <div className="flex items-center gap-2">
        {requested ? (
          <span className="text-xs font-medium">Talebiniz alındı, en kısa sürede dönüş yapacağız.</span>
        ) : (
          <>
            <Button asChild size="sm" variant={isBlocked ? 'primary' : 'outline'}>
              <Link href="/#fiyatlandirma">Paketleri gör</Link>
            </Button>
            <Button size="sm" variant={isBlocked ? 'outline' : 'ghost'} onClick={requestUpgrade} loading={requesting}>
              Talep gönder
            </Button>
          </>
        )}
        {!isBlocked ? (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Kapat"
            className="rounded p-1 hover:bg-warning-100"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function blockedMessage(reason: EntitlementsState['blockReason']): string {
  switch (reason) {
    case 'TRIAL_LIMIT_REACHED':
      return 'Deneme analiz hakkınız doldu. Çalışmaya devam etmek için bir paket seçin.'
    case 'SUBSCRIPTION_INACTIVE':
      return 'Aboneliğiniz aktif değil. Lütfen bizimle iletişime geçin.'
    case 'TRIAL_EXPIRED':
    default:
      return 'Deneme süreniz doldu. Mevcut raporlarınız erişilebilir; devam için bir paket seçin.'
  }
}
