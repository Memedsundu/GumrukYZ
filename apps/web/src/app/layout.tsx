import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GümrükYZ — Akıllı Gümrük Kontrol',
  description: 'Gümrük beyanname ön kontrol ve risk analiz sistemi',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="tr">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  )
}
