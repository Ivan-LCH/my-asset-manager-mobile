import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Sidebar, { DrawerNav } from './Sidebar'

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()

  // 라우트 변경 시 드로어 닫기
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* 데스크톱 사이드바 (lg 이상, 접기 가능) */}
      {!sidebarCollapsed && <Sidebar />}
      {/* 사이드바 토글 버튼 (데스크톱만) */}
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

      {/* 모바일 상단 헤더 + 본문 컬럼 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 모바일 헤더 */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 bg-gray-900 border-b border-gray-800">
          <button
            onClick={() => setOpen(true)}
            aria-label="메뉴 열기"
            className="p-2 -ml-2 rounded-lg text-gray-300 hover:bg-gray-800"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-blue-400 tracking-tight">💼 Asset Manager</h1>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* 모바일 드로어 */}
      {open && (
        <div className="lg:hidden">
          {/* 반투명 오버레이 */}
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} />
          {/* 슬라이드인 패널 */}
          <aside className="fixed inset-y-0 left-0 z-50 w-64 max-w-[80%] bg-gray-900 border-r border-gray-800 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 h-14 border-b border-gray-800">
              <h1 className="text-base font-bold text-blue-400 tracking-tight">💼 Asset Manager</h1>
              <button
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
                className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <DrawerNav onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  )
}
