'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Crumb = { label: string; href?: string }

// Segments that exist only as URL containers (no index page) — skip in the trail.
const CONTAINER_SEGMENTS = new Set(['submissions', 'admin'])

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Kontrol paneli',
  documents: 'Belgeler',
  report: 'Risk Raporu',
  rules: 'Kural Yönetimi',
  sources: 'Mevzuat Kaynakları',
  clients: 'Müşteri Kaydı',
  observability: 'Sağlayıcı Takibi',
  audit: 'Denetim Günlüğü',
  profile: 'Profilim',
}

function isDynamic(segment: string) {
  return !SEGMENT_LABELS[segment] && segment !== 'new'
}

function labelFor(segment: string, prev: string | undefined): string {
  if (segment === 'new') {
    if (prev === 'submissions') return 'Yeni dosya'
    if (prev === 'clients') return 'Yeni müşteri'
    return 'Yeni'
  }
  if (isDynamic(segment)) {
    if (prev === 'submissions') return 'Dosya'
    if (prev === 'clients') return 'Düzenle'
    return segment
  }
  return SEGMENT_LABELS[segment] ?? segment
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] === 'dashboard') return [{ label: 'Kontrol paneli' }]

  const crumbs: Crumb[] = [{ label: 'Kontrol paneli', href: '/dashboard' }]
  segments.forEach((segment, i) => {
    if (CONTAINER_SEGMENTS.has(segment)) return
    const href = '/' + segments.slice(0, i + 1).join('/')
    crumbs.push({ label: labelFor(segment, segments[i - 1]), href })
  })

  // Last crumb is the current page — drop its link.
  if (crumbs.length > 1) crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1].label }
  return crumbs
}

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname()
  const crumbs = buildCrumbs(pathname)

  return (
    <nav aria-label="Breadcrumb" className={cn('flex min-w-0 items-center gap-1 text-sm', className)}>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-4 shrink-0 text-ink-subtle" />}
            {crumb.href && !last ? (
              <Link href={crumb.href} className="truncate text-ink-muted transition-colors hover:text-ink">
                {crumb.label}
              </Link>
            ) : (
              <span className={cn('truncate', last ? 'font-medium text-ink' : 'text-ink-muted')}>
                {crumb.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
