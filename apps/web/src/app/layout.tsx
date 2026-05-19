import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { trTR } from '@clerk/localizations'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
const clerkLocalization = {
  ...trTR,
  signIn: {
    ...trTR.signIn,
    emailCode: {
      ...(trTR.signIn?.emailCode ?? {}),
      subtitle: 'GümrükYZ ile devam etmek için',
    },
    password: {
      ...(trTR.signIn?.password ?? {}),
      subtitle: 'GümrükYZ ile devam etmek için',
    },
    start: {
      ...(trTR.signIn?.start ?? {}),
      subtitle: 'GümrükYZ ile devam etmek için',
      subtitleCombined: 'GümrükYZ ile devam etmek için',
    },
  },
  signUp: {
    ...trTR.signUp,
    continue: {
      ...(trTR.signUp?.continue ?? {}),
      subtitle: 'GümrükYZ ile devam etmek için',
    },
    emailCode: {
      ...(trTR.signUp?.emailCode ?? {}),
      subtitle: 'GümrükYZ ile devam etmek için',
    },
    start: {
      ...(trTR.signUp?.start ?? {}),
      subtitle: 'GümrükYZ ile devam etmek için',
      subtitleCombined: 'GümrükYZ ile devam etmek için',
    },
  },
}

export const metadata: Metadata = {
  title: 'GümrükYZ — Akıllı Gümrük Kontrol',
  description: 'Gümrük beyanname ön kontrol ve risk analiz sistemi',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={inter.className}>
        <ClerkProvider localization={clerkLocalization}>{children}</ClerkProvider>
      </body>
    </html>
  )
}
