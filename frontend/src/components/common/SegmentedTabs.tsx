// 공용 세그먼트 탭/칩 — 상단 고정 헤더 + 가로 스크롤 칩 (UI 간소화 ①).
// AssetsPage(유형 칩)·AnalysisPage(분석 탭) 등 "허브 내 하위 화면 전환"에 공용 사용.
import { cn } from '@/lib/utils'

export interface SegmentTab<T extends string> {
  value: T
  label: string
  emoji?: string
}

export function SegmentedTabs<T extends string>({ tabs, value, onChange }: {
  tabs: SegmentTab<T>[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 py-2 flex gap-1.5 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn('shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
              value === t.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200')}
          >
            {t.emoji && `${t.emoji} `}{t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
