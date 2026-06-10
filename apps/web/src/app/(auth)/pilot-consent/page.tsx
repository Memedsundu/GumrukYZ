import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getProvisioningUser } from '@/lib/auth'
import { BrandMark } from '@/components/ui/brand-mark'
import PilotConsentForm from './consent-form'

export default async function PilotConsentPage() {
  const { userId, orgId } = await auth()
  if (!userId) redirect('/sign-in')
  if (!orgId) redirect('/onboarding')

  const user = await getProvisioningUser()
  if (user.pilotConsentAt) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-2xl animate-fade-rise rounded-2xl border border-line bg-surface p-8 shadow-card">
        <BrandMark size="sm" className="mb-5" />
        <h1 className="font-display text-xl font-bold text-ink">Pilot kullanım koşulları</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {user.tenant.name} — GümrükYZ beta pilot programı
        </p>
        <PilotConsentForm />
      </div>
    </div>
  )
}
