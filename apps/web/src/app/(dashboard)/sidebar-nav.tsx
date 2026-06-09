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

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  )
}

export function SidebarNav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {mainNav.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item.href)} />
      ))}

      {showAdmin && (
        <div className="pt-4">
          <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Yönetim
          </p>
          {adminNav.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
      )}
    </nav>
  )
}
