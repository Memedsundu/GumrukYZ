import { UserProfile } from '@clerk/nextjs'

export default function ProfilePage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Profilim</h1>
        <p className="mt-1 text-sm text-gray-500">
          Hesap bilgilerinizi ve güvenlik ayarlarınızı yönetin.
        </p>
      </div>

      <UserProfile path="/profile" routing="path" />
    </div>
  )
}
