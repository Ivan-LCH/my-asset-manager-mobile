import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, Home, FolderOpen, BarChart3, Settings } from 'lucide-react'
import Sidebar from './Sidebar'
import { cn } from '@/lib/utils'

// 하단 탭 4개 (모바일 전용 — 데스크톱은 사이드바)
const TABS = [
  { to: '/',         icon: Home,       label: '홈',   end: true,
    match: (p: string) => p === '/' },
  { to: '/assets',   icon: FolderOpen, label: '자산',
    match: (p: string) =>
      p.startsWith('/assets') ||
      ['/stock', '/real-estate', '/pension', '/savings', '/physical', '/etc'].includes(p) },
  { to: '/analysis', icon: BarChart3,  label: '분석',
    match: (p: string) =>
      p.startsWith('/analysis') ||
      ['/prep', '/pension/sim', '/corp-sim', '/retirement'].includes(p) },
  { to: '/settings', icon: Settings,   label: '설정',
    match: (p: string) => p.startsWith('/settings') },
]

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* 데스크톱 사이드바 (lg 이상, 접기 가능) */}
      {!sidebarCollapsed && <Sidebar />}
      <button
        onClick={() => setSidebarCollapsed((v) => !v)}
        aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 숨기기'}
        className={`hidden lg:flex items-center justify-center w-6 bg-gray-900 border-r border-gray-800 hover:bg-gray-800 transition-colors shrink-0 ${
          sidebarCollapsed ? 'h-14' : 'h-full'
        }`}
      >
        {sidebarCollapsed
          ? <PanelLeftOpen className="w-4 h-4 text-gray-400" />
          : <PanelLeftClose className="w-4 h-4 text-gray-400" />}
      </button>

      {/* 본문 컬럼 */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {/* 모바일 하단 탭바 (safe-area 대응) */}
        <nav
          className="lg:hidden flex border-t border-gray-800 bg-gray-900 shrink-0"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {TABS.map(({ to, icon: Icon, label, match }) => {
            const active = match(pathname)
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300',
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
