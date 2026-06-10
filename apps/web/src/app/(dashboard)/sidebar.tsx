'use client'

import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarNav } from './sidebar-nav'

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex h-16 items-center border-b border-line px-4', collapsed && 'justify-center px-0')}>
      <Link href="/dashboard" className="flex items-center gap-2" aria-label="GümrükYZ">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <ShieldCheck className="size-5" />
        </span>
        {!collapsed && <span className="font-display text-lg font-bold tracking-tight text-ink">GümrükYZ</span>}
      </Link>
    </div>
  )
}

export interface SidebarProps {
  showAdmin: boolean
  collapsed: boolean
  mobileOpen: boolean
  onMobileClose: () => void
  onNavigate: () => void
}

export function Sidebar({ showAdmin, collapsed, mobileOpen, onMobileClose, onNavigate }: SidebarProps) {
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
        <SidebarNav showAdmin={showAdmin} collapsed={collapsed} />
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
          <SidebarNav showAdmin={showAdmin} collapsed={false} onNavigate={onNavigate} />
        </aside>
      </div>
    </>
  )
}
