import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AccessDeniedIllustration } from '@/components/illustrations'

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="max-w-md animate-fade-rise rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <div className="flex justify-center text-ink-subtle">
          <AccessDeniedIllustration width={160} />
        </div>
        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-ink-subtle">403</p>
        <h1 className="mt-2 font-display text-xl font-bold text-ink">Erişim yetkiniz yok</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Bu sayfayı açmak için gerekli yetki hesabınızda tanımlı değil.
        </p>
        <Button asChild className="mt-6">
          <Link href="/sign-in">Giriş sayfasına dön</Link>
        </Button>
      </div>
    </main>
  )
}
