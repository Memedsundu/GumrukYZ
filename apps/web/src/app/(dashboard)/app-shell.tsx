'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

const COOKIE = 'sidebar_collapsed'

export function AppShell({
  showAdmin,
  initialCollapsed,
  children,
}: {
  showAdmin: boolean
  initialCollapsed: boolean
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  function toggleCollapse() {
    setCollapsed((v) => {
      const next = !v
      document.cookie = `${COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
      return next
    })
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar
        showAdmin={showAdmin}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
