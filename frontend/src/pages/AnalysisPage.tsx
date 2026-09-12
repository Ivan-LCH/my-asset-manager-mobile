import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RetirementPrepPage from './RetirementPrepPage'
import PensionSimPage from './PensionSimPage'
import CorpSimPage from './CorpSimPage'
import RetirementPage from './RetirementPage'
import { SegmentedTabs } from '@/components/common/SegmentedTabs'

type Tab = 'prep' | 'pension-sim' | 'corp-sim' | 'cashflow'

const TABS: { value: Tab; label: string; emoji: string }[] = [
  { value: 'prep',       label: '은퇴준비',   emoji: '🎯' },
  { value: 'pension-sim',label: '연금시뮬',   emoji: '🛡️' },
  { value: 'corp-sim',   label: '법인시뮬',   emoji: '🏢' },
  { value: 'cashflow',   label: '현금흐름',   emoji: '💵' },
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
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'prep'        && <RetirementPrepPage />}
      {tab === 'pension-sim' && <PensionSimPage />}
      {tab === 'corp-sim'    && <CorpSimPage />}
      {tab === 'cashflow'    && <RetirementPage />}
    </div>
  )
}
