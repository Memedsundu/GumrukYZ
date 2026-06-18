'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/ui/brand-mark'
import { SidebarNav, type RecentCase } from './sidebar-nav'

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex h-16 items-center border-b border-line px-4', collapsed && 'justify-center px-0')}>
      <Link href="/dashboard" className="flex items-center" aria-label="Mizan">
        <BrandMark size="sm" monogram={collapsed} subtitle={!collapsed} />
      </Link>
    </div>
  )
}

export interface SidebarProps {
  showAdmin: boolean
  recentCases: RecentCase[]
  collapsed: boolean
  mobileOpen: boolean
  onMobileClose: () => void
  onNavigate: () => void
}

export function Sidebar({ showAdmin, recentCases, collapsed, mobileOpen, onMobileClose, onNavigate }: SidebarProps) {
  return (
    <>
      {/* Desktop: static, collapsible to an icon rail */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <Brand collapsed={collapsed} />
        <SidebarNav showAdmin={showAdmin} recentCases={recentCases} collapsed={collapsed} />
      </aside>

      {/* Mobile: drawer + overlay */}
      <div className={cn('fixed inset-0 z-50 lg:hidden', !mobileOpen && 'pointer-events-none')}>
        <div
          aria-hidden
          onClick={onMobileClose}
          className={cn(
            'absolute inset-0 bg-ink/35 transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-surface shadow-pop transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <Brand collapsed={false} />
          <SidebarNav showAdmin={showAdmin} recentCases={recentCases} collapsed={false} onNavigate={onNavigate} />
        </aside>
      </div>
    </>
  )
}
