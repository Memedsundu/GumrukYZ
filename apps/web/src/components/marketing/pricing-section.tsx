'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { KDV_NOTE, PLAN_CATALOG, PLAN_CATALOG_ORDER } from '@gumrukyz/domain'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

function formatTry(kurus: number): string {
  return `₺${new Intl.NumberFormat('tr-TR').format(Math.round(kurus / 100))}`
}

export function PricingSection() {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')

  return (
    <section id="fiyatlandirma" className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-ink">Paketler</h2>
        <p className="mt-3 text-ink-muted">
          İhtiyacınıza uygun paketi seçin. {KDV_NOTE}.
        </p>

        <div className="mt-6 inline-flex items-center rounded-full border border-line bg-surface p-1 text-sm">
          <button
            type="button"
            onClick={() => setInterval('monthly')}
            className={cn(
              'rounded-full px-4 py-1.5 font-medium transition-colors',
              interval === 'monthly' ? 'bg-brand-600 text-white' : 'text-ink-muted',
            )}
          >
            Aylık
          </button>
          <button
            type="button"
            onClick={() => setInterval('annual')}
            className={cn(
              'rounded-full px-4 py-1.5 font-medium transition-colors',
              interval === 'annual' ? 'bg-brand-600 text-white' : 'text-ink-muted',
            )}
          >
            Yıllık
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {PLAN_CATALOG_ORDER.map((code) => {
          const plan = PLAN_CATALOG[code]
          const isAnnual = interval === 'annual'
          const priceKurus = isAnnual ? plan.price.annualKurus : plan.price.monthlyKurus
          const priceLabel = plan.customPricing
            ? `${formatTry(plan.price.monthlyKurus)}+`
            : priceKurus === null
              ? 'Özel'
              : formatTry(priceKurus)
          const unit = plan.customPricing ? '/ ay’dan başlayan' : isAnnual ? '/ yıl' : '/ ay'

          return (
            <div
              key={code}
              className={cn(
                'flex flex-col rounded-2xl border bg-surface p-6 shadow-card',
                plan.recommended ? 'border-brand-500 ring-1 ring-brand-500' : 'border-line',
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-semibold text-ink">{plan.publicName}</h3>
                {plan.recommended ? <Badge tone="info">Önerilen</Badge> : null}
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-3xl font-bold text-ink">{priceLabel}</span>
                <span className="text-sm text-ink-muted">{unit}</span>
              </div>
              <p className="mt-1 text-xs text-ink-subtle">
                {plan.customPricing ? 'Limitler firmaya göre özelleştirilir.' : `${KDV_NOTE}. ${plan.annualCopy}.`}
              </p>

              <ul className="mt-6 space-y-2.5 text-sm text-ink-soft">
                <Feature>{`Aylık ${plan.limits.analysesPerMonth} analiz`}</Feature>
                <Feature>{`${plan.limits.users} kullanıcı`}</Feature>
                <Feature>{`Aylık ${plan.limits.expertReviewsPerMonth} uzman yapay zeka incelemesi`}</Feature>
                <Feature>{`Dosya başına ${plan.limits.documentsPerSubmission} belge`}</Feature>
              </ul>

              <div className="mt-8">
                <Button
                  asChild
                  variant={plan.recommended ? 'primary' : 'outline'}
                  className="w-full"
                >
                  <Link href="/sign-up">{plan.cta.label}</Link>
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
      <span>{children}</span>
    </li>
  )
}
