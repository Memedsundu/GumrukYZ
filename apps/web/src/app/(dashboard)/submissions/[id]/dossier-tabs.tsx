'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, FileText, ListChecks, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  submissionId: string
  hasReport: boolean
}

const tabClass = (active: boolean) =>
  cn(
    'inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
    active
      ? 'border-brand-600 text-brand-700'
      : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink',
  )

/**
 * Persistent dossier tab bar. Lives in the submission layout so it stays mounted
 * across navigations between the three surfaces — Belgeler (prepare), Risk Raporu
 * (read), Aksiyon Listesi (execute) — which read as one workspace, not separate pages.
 */
export function DossierTabs({ submissionId, hasReport }: Props) {
  const pathname = usePathname()
  const base = `/submissions/${submissionId}`

  const tabs: Array<{ href: string; label: string; icon: LucideIcon; requiresReport: boolean }> = [
    { href: `${base}/documents`, label: 'Belgeler', icon: FileText, requiresReport: false },
    { href: `${base}/report`, label: 'Risk Raporu', icon: BarChart3, requiresReport: true },
    { href: `${base}/actions`, label: 'Aksiyon Listesi', icon: ListChecks, requiresReport: true },
  ]

  return (
    <nav aria-label="Dosya bölümleri" className="mt-5 border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname?.startsWith(tab.href) ?? false
          const Icon = tab.icon
          return (
            <li key={tab.href}>
              {tab.requiresReport && !hasReport ? (
                <span
                  aria-disabled="true"
                  title="Analiz tamamlandığında açılır"
                  className="inline-flex cursor-not-allowed items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-ink-subtle"
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </span>
              ) : (
                <Link href={tab.href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
