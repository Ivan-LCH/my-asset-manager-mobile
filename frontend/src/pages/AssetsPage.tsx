import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import AssetCreateForm from '@/components/assets/AssetCreateForm'
import RealEstatePage from './RealEstatePage'
import StockPage from './StockPage'
import PensionPage from './PensionPage'
import AssetPage from './AssetPage'
import { SegmentedTabs } from '@/components/common/SegmentedTabs'
import type { AssetType } from '@/types'
import { CurrentAssetsOverview } from '@/planner/pages'

// 유형별 아이콘/색 (칩) — 실물·기타는 하나로 병합 (UI 간소화 ④)
const CHIPS: { value: AssetType | 'ALL'; label: string; emoji: string }[] = [
  { value: 'ALL',         label: '전체',     emoji: '📋' },
  { value: 'STOCK',       label: '주식',     emoji: '📈' },
  { value: 'REAL_ESTATE', label: '부동산',   emoji: '🏠' },
  { value: 'PENSION',     label: '연금',     emoji: '🛡️' },
  { value: 'SAVINGS',     label: '예적금',   emoji: '💰' },
  { value: 'ETC',         label: '실물·기타', emoji: '💎' },
]

/** 병합 전 구값 'PHYSICAL' → 'ETC' 칩으로 정규화 */
const normalizeTab = (v: string | null) => (v === 'PHYSICAL' ? 'ETC' : v) as AssetType | 'ALL' | null

/**
 * 자산 통합 페이지 — 유형 칩으로 기존 유형별 페이지를 그대로 표시.
 * 칩 선택값은 localStorage에 기억 (다음 방문 시 마지막 유형).
 */
export default function AssetsPage() {
  const [params, setParams] = useSearchParams()
  const requested = normalizeTab(params.get('type'))
  const type = CHIPS.some(c => c.value === requested) ? requested! : 'ALL'
  const setType = (value: AssetType | 'ALL') => setParams({ type: value })

  return (
    <div>
      {/* 유형 칩 — 스크롤해도 상단 고정 */}
      <SegmentedTabs tabs={CHIPS} value={type} onChange={setType} />

      {/* 선택 유형의 기존 페이지 (그대로 재사용) */}
      {type === 'STOCK'       && <StockPage />}
      {type === 'REAL_ESTATE' && <RealEstatePage />}
      {type === 'PENSION'     && <PensionPage />}
      {type === 'SAVINGS'     && <AssetPage types={['SAVINGS']} />}
      {type === 'ETC'         && <AssetPage types={['PHYSICAL', 'ETC']} />}
      {type === 'ALL'         && <><AllCreate /><CurrentAssetsOverview /></>}
    </div>
  )
}

/** 전체 탭 신규 추가 — 유형 선택(defaultType 없이)부터 시작 */
function AllCreate() {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-4 md:px-6 pt-4 max-w-7xl mx-auto space-y-3" data-all-create>
      <div className="flex justify-end">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> 신규 추가
        </button>
      </div>
      {open && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <AssetCreateForm onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
