import { useState, useLayoutEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, Home, FolderOpen, BarChart3, CalendarDays } from 'lucide-react'
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
      p.startsWith('/analysis') || p.startsWith('/plan') || p.startsWith('/advanced-analysis') ||
      ['/prep', '/pension/sim', '/corp-sim', '/retirement'].includes(p) },
]

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { pathname, search } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const scrollMemory = useRef(new Map<string,number>())
  const scrollParams = new URLSearchParams(search); if(pathname==='/assets')scrollParams.delete('asset')
  const scrollKey = pathname + '?' + scrollParams.toString()
  useLayoutEffect(()=>{
    const main=mainRef.current;if(!main)return
    const target=scrollMemory.current.get(scrollKey)??0
    let restoring=target>0
    const restore=()=>{if(restoring&&main.scrollHeight-main.clientHeight>=target){main.scrollTop=target;restoring=false}}
    if(!restoring)main.scrollTop=0
    restore()
    const observer=new MutationObserver(restore);observer.observe(main,{childList:true,subtree:true})
    const remember=()=>{if(!restoring)scrollMemory.current.set(scrollKey,main.scrollTop)}
    const cancel=()=>{restoring=false;remember()}
    main.addEventListener('scroll',remember);main.addEventListener('wheel',cancel);main.addEventListener('touchstart',cancel);main.addEventListener('pointerdown',cancel)
    return()=>{remember();observer.disconnect();main.removeEventListener('scroll',remember);main.removeEventListener('wheel',cancel);main.removeEventListener('touchstart',cancel);main.removeEventListener('pointerdown',cancel)}
  },[scrollKey])

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
        <main ref={mainRef} className="flex-1 overflow-y-auto">
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
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors',
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
