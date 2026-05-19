import { auth } from '@clerk/nextjs/server'
import { OrganizationList } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'

export default async function OnboardingPage() {
  const { userId, orgId } = await auth()
  if (!userId) redirect('/sign-in')
  if (orgId) redirect('/pilot-consent')

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-blue-600" />
          <span className="text-xl font-bold text-gray-900">GümrükYZ</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Firmanızı seçin</h1>
        <p className="mt-2 text-sm text-gray-600">
          Pilot erişimi organizasyon davetiyesi ile verilir. E-postanıza gelen daveti kabul edin veya
          aşağıdan organizasyonunuzu seçin.
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
