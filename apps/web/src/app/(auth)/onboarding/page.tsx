import { auth } from '@clerk/nextjs/server'
import { OrganizationList } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import { BrandMark } from '@/components/ui/brand-mark'
import { RouteMapIllustration } from '@/components/illustrations'

export default async function OnboardingPage() {
  const { userId, orgId } = await auth()
  if (!userId) redirect('/sign-in')
  if (orgId) redirect('/pilot-consent')

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-lg animate-fade-rise rounded-2xl border border-line bg-surface p-8 shadow-card">
        <div className="mb-6 flex items-center justify-between gap-4">
          <BrandMark />
          <div className="text-ink-subtle">
            <RouteMapIllustration width={110} />
          </div>
        </div>
        <h1 className="font-display text-lg font-semibold text-ink">Firmanızı seçin</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Beta kullanımına başlamak için mevcut firmanızı seçin veya yeni firma oluşturun.
          Dosyalar yalnızca seçtiğiniz firma alanında görünür.
        </p>
        <div className="mt-6">
          <OrganizationList
            hidePersonal
            afterSelectOrganizationUrl="/pilot-consent"
            afterCreateOrganizationUrl="/pilot-consent"
          />
        </div>
      </div>
    </div>
  )
}
