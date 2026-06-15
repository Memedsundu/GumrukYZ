import { SignUp } from '@clerk/nextjs'
import { BrandMark } from '@/components/ui/brand-mark'
import { authClerkAppearance } from '@/lib/clerk-auth-appearance'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-8 animate-fade-rise">
        <div className="flex flex-col items-center text-center">
          <BrandMark size="lg" />
          <p className="mt-3 text-sm text-ink-muted">Mizan ile devam etmek için</p>
        </div>
        <div className="w-full">
          <SignUp appearance={authClerkAppearance} />
        </div>
      </div>
    </div>
  )
}
