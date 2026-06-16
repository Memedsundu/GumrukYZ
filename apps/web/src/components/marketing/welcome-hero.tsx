import Link from 'next/link'
import { ArrowRight, FileText, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STEPS = [
  {
    icon: <FileText className="size-5 text-brand-600" />,
    tint: 'bg-brand-50',
    title: 'Dosya oluştur',
    text: 'Referans adını girip belgeleri yükleyin.',
  },
  {
    icon: <Sparkles className="size-5 text-ai-600" />,
    tint: 'bg-ai-50',
    title: 'Otomatik Risk Kontrolü çalıştır',
    text: 'Kurallar ve otomatik risk kontrolü beyan öncesi çalışır.',
  },
  {
    icon: <ShieldCheck className="size-5 text-success-600" />,
    tint: 'bg-success-50',
    title: 'Raporu incele',
    text: 'Riskleri, önerileri ve yasal dayanakları tek ekranda görün.',
  },
]

export function WelcomeHero() {
  return (
    <section className="grid gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          Beyan öncesi gümrük risk kontrolü
        </p>
        <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          Gümrük risklerini beyan öncesi dengeleyin
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-ink-muted">
          Mizan; faturaları, çeki listelerini, taşıma belgelerini, GTİP tutarlılığını, menşei, kıymet ve
          ağırlıkları beyan öncesinde inceleyerek riskleri ve olası cezaları ortaya çıkarır. Dakikalar içinde
          doğru GTİP, daha az hata.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/sign-up">
              14 gün ücretsiz Firma denemesi
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/ornek-rapor">Örnek risk raporunu gör</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-subtle">Kredi kartı gerekmez · 14 gün veya 15 analiz</p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="space-y-4">
          {STEPS.map((item) => (
            <div key={item.title} className="flex gap-3 rounded-xl bg-surface-muted p-4">
              <div
                className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${item.tint}`}
              >
                {item.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-sm text-ink-muted">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
