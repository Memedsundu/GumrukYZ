'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Settings,
  Globe,
  Users,
  Activity,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const mainNav: NavItem[] = [
  { href: '/dashboard', label: 'Kontrol paneli', icon: LayoutDashboard },
  { href: '/submissions/new', label: 'Yeni dosya', icon: FileText },
]

const adminNav: NavItem[] = [
  { href: '/admin/rules', label: 'Kural Yönetimi', icon: Settings },
  { href: '/admin/sources', label: 'Mevzuat Kaynakları', icon: Globe },
  { href: '/admin/clients', label: 'Müşteri Kaydı', icon: Users },
  { href: '/admin/observability', label: 'Sağlayıcı Takibi', icon: Activity },
  { href: '/admin/audit', label: 'Denetim Günlüğü', icon: ScrollText },
]

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
  collapsed = false,
  onNavigate,
}: {
  showAdmin: boolean
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <TooltipProvider delayDuration={150}>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

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
    </TooltipProvider>
  )
}
