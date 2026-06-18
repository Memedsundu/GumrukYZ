'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, ListChecks } from 'lucide-react'
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
 * across navigations between the Belgeler (documents) and Aksiyonlar (report)
 * surfaces — the two surfaces read as one workspace rather than separate pages.
 */
export function DossierTabs({ submissionId, hasReport }: Props) {
  const pathname = usePathname()
  const base = `/submissions/${submissionId}`
  const onDocuments = pathname?.startsWith(`${base}/documents`) ?? false
  const onReport = pathname?.startsWith(`${base}/report`) ?? false

  return (
    <nav aria-label="Dosya bölümleri" className="mt-5 border-b border-line">
      <ul className="-mb-px flex gap-1">
        <li>
          <Link href={`${base}/documents`} aria-current={onDocuments ? 'page' : undefined} className={tabClass(onDocuments)}>
            <FileText className="h-4 w-4" />
            Belgeler
          </Link>
        </li>
        <li>
          {hasReport ? (
            <Link href={`${base}/report`} aria-current={onReport ? 'page' : undefined} className={tabClass(onReport)}>
              <ListChecks className="h-4 w-4" />
              Aksiyon listesi
            </Link>
          ) : (
            <span
              aria-disabled="true"
              title="Analiz tamamlandığında aksiyon listesi açılır"
              className="inline-flex cursor-not-allowed items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-ink-subtle"
            >
              <ListChecks className="h-4 w-4" />
              Aksiyon listesi
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}
