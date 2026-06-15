import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ArrowRight, FileText, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/ui/brand-mark'

export default async function BetaPage() {
  const { userId, orgId } = await auth()
  if (userId && orgId) redirect('/dashboard')
  if (userId) redirect('/onboarding')

  return (
    <main className="min-h-screen bg-canvas px-6 py-10 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col justify-between">
        <header>
          <BrandMark size="md" />
        </header>

        <section className="grid gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Beta sürüm</p>
            <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
              Gümrük kontrolü, yapay zekâ ile dengelenir
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-ink-muted">
              Mizan; faturaları, çeki listelerini, taşıma belgelerini, GTİP tutarlılığını, menşei, kıymet ve
              ağırlıkları beyan öncesinde inceleyerek riskleri ortaya çıkarır. E-posta adresinizle kayıt olun,
              firmanızı oluşturun ve gerçek test dosyalarınızı yükleyin.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Beta kullanıma başla
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/sign-in">Hesabım var</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="space-y-4">
              {[
                {
                  icon: <FileText className="size-5 text-brand-600" />,
                  tint: 'bg-brand-50',
                  title: 'Dosya oluştur',
                  text: 'Referans adını girip belgeleri yükleyin.',
                },
                {
                  icon: <Sparkles className="size-5 text-ai-600" />,
                  tint: 'bg-ai-50',
                  title: 'Mizan kontrolünü çalıştır',
                  text: 'Kurallar ve hızlı yapay zekâ kural kontrolü otomatik çalışır.',
                },
                {
                  icon: <ShieldCheck className="size-5 text-success-600" />,
                  tint: 'bg-success-50',
                  title: 'Raporu incele',
                  text: 'Riskleri, önerileri ve kalan uzman yapay zekâ hakkınızı aynı ekranda görün.',
                },
              ].map((item) => (
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

        <footer className="text-xs text-ink-subtle">
          Beta erişimi e-posta kaydı ve firma oluşturma adımıyla başlar.
        </footer>
      </div>
    </main>
  )
}
