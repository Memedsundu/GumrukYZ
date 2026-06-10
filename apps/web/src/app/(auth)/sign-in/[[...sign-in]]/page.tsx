import { SignIn } from '@clerk/nextjs'
import { BrandMark } from '@/components/ui/brand-mark'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md animate-fade-rise">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size="lg" />
          <p className="mt-3 text-sm text-ink-muted">Akıllı Gümrük Kontrol Sistemi</p>
        </div>
        <SignIn />
      </div>
    </div>
  )
}
