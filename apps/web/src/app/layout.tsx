import type { Metadata } from 'next'
import { Inter, Sora, IBM_Plex_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { trTR } from '@clerk/localizations'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const sora = Sora({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sora',
})
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
})
const clerkLocalization = {
  ...trTR,
  signIn: {
    ...trTR.signIn,
    emailCode: {
      ...(trTR.signIn?.emailCode ?? {}),
      subtitle: 'Mizan ile devam etmek için',
    },
    password: {
      ...(trTR.signIn?.password ?? {}),
      subtitle: 'Mizan ile devam etmek için',
    },
    start: {
      ...(trTR.signIn?.start ?? {}),
      subtitle: 'Mizan ile devam etmek için',
      subtitleCombined: 'Mizan ile devam etmek için',
    },
  },
  signUp: {
    ...trTR.signUp,
    continue: {
      ...(trTR.signUp?.continue ?? {}),
      subtitle: 'Mizan ile devam etmek için',
    },
    emailCode: {
      ...(trTR.signUp?.emailCode ?? {}),
      subtitle: 'Mizan ile devam etmek için',
    },
    start: {
      ...(trTR.signUp?.start ?? {}),
      subtitle: 'Mizan ile devam etmek için',
      subtitleCombined: 'Mizan ile devam etmek için',
    },
  },
}

export const metadata: Metadata = {
  title: 'Mizan — Gümrük kontrolü, yapay zekâ ile dengelenir',
  description:
    'Mizan, gümrük beyannamesi ve ticari belgeler için yapay zekâ destekli ön kontrol ve risk analizi sağlar.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${inter.variable} ${sora.variable} ${ibmPlexMono.variable}`}>
      <body className="font-sans antialiased">
        <ClerkProvider localization={clerkLocalization}>{children}</ClerkProvider>
      </body>
    </html>
  )
}
