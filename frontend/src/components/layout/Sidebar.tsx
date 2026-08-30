import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FolderOpen, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

// 간소화된 4개 메뉴 (자산/분석 상세는 각 통합 페이지 안의 칩·탭에서)
export const NAV_ITEMS = [
  { to: '/',        icon: LayoutDashboard, label: '홈',   end: true },
  { to: '/assets',  icon: FolderOpen,      label: '자산' },
  { to: '/analysis',icon: BarChart3,       label: '분석' },
  { to: '/settings',icon: Settings,        label: '설정' },
]

const navItemClass = (isActive: boolean) =>
  cn(
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    isActive
      ? 'bg-blue-600/20 text-blue-400'
      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100',
  )

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex-col">
      {/* 로고 */}
      <div className="px-5 py-5 border-b border-gray-800">
        <h1 className="text-base font-bold text-blue-400 tracking-tight">💼 Asset Manager</h1>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => navItemClass(isActive)}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
