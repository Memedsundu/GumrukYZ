import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">403</p>
        <h1 className="mt-2 text-xl font-bold text-gray-900">Erişim yetkiniz yok</h1>
        <p className="mt-3 text-sm text-gray-600">
          Bu sayfayı açmak için gerekli yetki hesabınızda tanımlı değil.
        </p>
        <Link
          href="/sign-in"
          className="mt-5 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Giriş sayfasına dön
        </Link>
      </div>
    </main>
  )
}
