import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RetirementPrepPage from './RetirementPrepPage'
import PensionSimPage from './PensionSimPage'
import CorpSimPage from './CorpSimPage'
import RetirementPage from './RetirementPage'

type Tab = 'prep' | 'pension-sim' | 'corp-sim' | 'cashflow'

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: 'prep',       label: '은퇴준비',   emoji: '🎯' },
  { key: 'pension-sim',label: '연금시뮬',   emoji: '🛡️' },
  { key: 'corp-sim',   label: '법인시뮬',   emoji: '🏢' },
  { key: 'cashflow',   label: '현금흐름',   emoji: '💵' },
]

/**
 * 분석 통합 페이지 — 세그먼트 탭으로 4개 분석 화면을 하나로.
 * 선택 탭은 localStorage에 기억.
 */
export default function AnalysisPage() {
  const [params] = useSearchParams()
  const pTab = params.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(
    pTab ?? (localStorage.getItem('analysis_tab') as Tab) ?? 'prep',
  )

  useEffect(() => {
    localStorage.setItem('analysis_tab', tab)
  }, [tab])

  return (
    <div>
      {/* 세그먼트 탭 — 스크롤해도 상단 고정 */}
      <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-2 flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                tab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'prep'        && <RetirementPrepPage />}
      {tab === 'pension-sim' && <PensionSimPage />}
      {tab === 'corp-sim'    && <CorpSimPage />}
      {tab === 'cashflow'    && <RetirementPage />}
    </div>
  )
}
