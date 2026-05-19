import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getProvisioningUser } from '@/lib/auth'
import PilotConsentForm from './consent-form'

export default async function PilotConsentPage() {
  const { userId, orgId } = await auth()
  if (!userId) redirect('/sign-in')
  if (!orgId) redirect('/onboarding')

  const user = await getProvisioningUser()
  if (user.pilotConsentAt) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Pilot kullanım koşulları</h1>
        <p className="mt-2 text-sm text-gray-600">
          {user.tenant.name} — GümrükYZ beta pilot programı
        </p>
        <PilotConsentForm />
      </div>
    </div>
  )
}
