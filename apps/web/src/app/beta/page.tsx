import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ArrowRight, FileText, ShieldCheck, Sparkles } from 'lucide-react'

export default async function BetaPage() {
  const { userId, orgId } = await auth()
  if (userId && orgId) redirect('/dashboard')
  if (userId) redirect('/onboarding')

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col justify-between">
        <header className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-bold">GümrükYZ</span>
        </header>

        <section className="grid gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Beta sürüm</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-normal text-slate-950 md:text-5xl">
              Gümrük dosyalarını dakikalar içinde ön kontrolden geçirin
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              E-posta adresinizle kayıt olun, firmanızı oluşturun ve gerçek test dosyalarınızı yükleyerek
              kural kontrolü, hızlı AI doğrulaması ve isteğe bağlı uzman AI incelemesini deneyin.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Beta kullanıma başla
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Hesabım var
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-4">
              {[
                {
                  icon: <FileText className="h-5 w-5 text-blue-600" />,
                  title: 'Dosya oluştur',
                  text: 'Referans adını girip belgeleri yükleyin.',
                },
                {
                  icon: <Sparkles className="h-5 w-5 text-indigo-600" />,
                  title: 'Analizi çalıştır',
                  text: 'Kurallar ve hızlı AI kural kontrolü otomatik çalışır.',
                },
                {
                  icon: <ShieldCheck className="h-5 w-5 text-emerald-600" />,
                  title: 'Raporu incele',
                  text: 'Riskleri, önerileri ve kalan uzman AI hakkınızı aynı ekranda görün.',
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3 rounded-md bg-slate-50 p-4">
                  <div className="mt-0.5">{item.icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="text-xs text-slate-500">
          Beta erişimi e-posta kaydı ve firma oluşturma adımıyla başlar.
        </footer>
      </div>
    </main>
  )
}
