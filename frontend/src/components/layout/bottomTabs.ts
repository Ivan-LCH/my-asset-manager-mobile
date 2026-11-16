import { Home, FolderOpen, BarChart3, SlidersHorizontal } from 'lucide-react'

// 하단 탭 4개 (모바일 전용 — 데스크톱은 사이드바): 홈 | 자산 | 분석(결과) | 입력/설정
// 입력/설정 탭: 분석 입력 허브 + Drive 백업·복원·내보내기 진입점 (모바일에서 사이드바가 숨겨지므로 이 탭뿐이다).
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
      ['/pension/sim', '/corp-sim', '/retirement'].includes(p) },
  { to: '/settings', icon: SlidersHorizontal, label: '입력/설정',
    match: (p: string) => p.startsWith('/settings') || p === '/prep' },
]
