'use client'

import { Menu, PanelLeftClose, PanelLeft } from 'lucide-react'
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'

export interface TopbarProps {
  onMenuClick: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export function Topbar({ onMenuClick, collapsed, onToggleCollapse }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Menüyü aç"
        className="flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
        className="hidden size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink lg:flex"
      >
        {collapsed ? <PanelLeft className="size-5" /> : <PanelLeftClose className="size-5" />}
      </button>

      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          appearance={{ elements: { organizationSwitcherTrigger: 'px-2 py-1.5' } }}
        />
        <UserButton userProfileMode="navigation" userProfileUrl="/profile" />
      </div>
    </header>
  )
}
