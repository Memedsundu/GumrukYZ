import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/ui/brand-mark'
import { WelcomeHero } from '@/components/marketing/welcome-hero'
import { PricingSection } from '@/components/marketing/pricing-section'
import { LegalCopy } from '@/components/marketing/legal-copy'

export default async function HomePage() {
  // Signed-in users skip the marketing page (middleware also redirects).
  const { userId, orgId } = await auth()
  if (userId && orgId) redirect('/dashboard')
  if (userId) redirect('/onboarding')

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <BrandMark size="md" />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/sign-in">Giriş yap</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Ücretsiz dene</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6">
        <WelcomeHero />
      </div>

      <PricingSection />
      <LegalCopy />

      <footer className="border-t border-line py-8 text-center text-xs text-ink-subtle">
        Mizan — A ZANAI product · Beyan öncesi gümrük risk kontrolü
      </footer>
    </main>
  )
}
