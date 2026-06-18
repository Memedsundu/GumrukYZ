'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Plus,
  Settings,
  Globe,
  Users,
  Activity,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { submissionResumeHref } from '@/lib/submission-status'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

export type RecentCase = {
  id: string
  title: string
  status: string
  hasReport: boolean
}

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const mainNav: NavItem[] = [
  { href: '/dashboard', label: 'Kontrol paneli', icon: LayoutDashboard },
]

const adminNav: NavItem[] = [
  { href: '/admin/rules', label: 'Kural Yönetimi', icon: Settings },
  { href: '/admin/sources', label: 'Mevzuat Kaynakları', icon: Globe },
  { href: '/admin/clients', label: 'Müşteri Kaydı', icon: Users },
  { href: '/admin/observability', label: 'Sağlayıcı Takibi', icon: Activity },
  { href: '/admin/audit', label: 'Denetim Günlüğü', icon: ScrollText },
]

function NewCaseButton({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const link = (
    <Link
      href="/submissions/new"
      aria-label="Yeni dosya"
      onClick={onNavigate}
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700',
        collapsed ? 'px-0' : 'px-3',
      )}
    >
      <Plus className="size-5 shrink-0" />
      {!collapsed && <span>Yeni dosya</span>}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">Yeni dosya</TooltipContent>
    </Tooltip>
  )
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const link = (
    <Link
      href={item.href}
      aria-label={item.label}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
        collapsed && 'justify-center px-0',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
      )}
    >
      <Icon className="size-5 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

export function SidebarNav({
  showAdmin,
  recentCases,
  collapsed = false,
  onNavigate,
}: {
  showAdmin: boolean
  recentCases: RecentCase[]
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-3 pt-4">
          <NewCaseButton collapsed={collapsed} onNavigate={onNavigate} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {mainNav.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} onNavigate={onNavigate} />
          ))}

          {!collapsed && (
            <div className="pt-4">
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                Dosyalar
              </p>
              {recentCases.length === 0 ? (
                <p className="px-3 py-2 text-sm text-ink-subtle">Henüz dosya yok.</p>
              ) : (
                <div className="space-y-0.5">
                  {recentCases.map((item) => {
                    const active = pathname.startsWith(`/submissions/${item.id}`)
                    return (
                      <Link
                        key={item.id}
                        href={submissionResumeHref(item.id, item.status, item.hasReport)}
                        onClick={onNavigate}
                        title={item.title}
                        className={cn(
                          'block truncate rounded-xl px-3 py-2 text-sm transition-colors',
                          active
                            ? 'bg-brand-50 font-medium text-brand-700'
                            : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                        )}
                      >
                        {item.title}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {showAdmin && (
            <div className="pt-4">
              {!collapsed && (
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  Yönetim
                </p>
              )}
              {collapsed && <div className="mx-3 mb-2 border-t border-line" />}
              {adminNav.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </nav>
      </div>
    </TooltipProvider>
  )
}
