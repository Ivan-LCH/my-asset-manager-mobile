import { Home, FolderOpen, BarChart3, Settings } from 'lucide-react'

// 하단 탭 4개 (모바일 전용 — 데스크톱은 사이드바)
// 설정 탭: 모바일에서 사이드바가 숨겨지므로 Drive 백업·복원·내보내기 진입점은 이 탭뿐이다.
export const TABS = [
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
  { to: '/settings', icon: Settings,   label: '설정',
    match: (p: string) => p.startsWith('/settings') },
]
