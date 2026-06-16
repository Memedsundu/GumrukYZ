import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { requirePlatformAdminPage } from '@/lib/platform-admin'
import { BrandMark } from '@/components/ui/brand-mark'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requirePlatformAdminPage()

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <Link href="/platform" className="flex items-center gap-2">
              <BrandMark size="sm" monogram />
              <span className="font-display text-sm font-semibold text-ink">Platform Konsolu</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-ink-muted sm:inline">{email}</span>
            <UserButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
