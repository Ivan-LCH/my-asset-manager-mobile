import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RealEstatePage from './RealEstatePage'
import StockPage from './StockPage'
import PensionPage from './PensionPage'
import AssetPage from './AssetPage'
import type { AssetType } from '@/types'

// 유형별 아이콘/색 (칩)
const CHIPS: { type: AssetType | 'ALL'; label: string; emoji: string }[] = [
  { type: 'ALL',         label: '전체',   emoji: '📋' },
  { type: 'STOCK',       label: '주식',   emoji: '📈' },
  { type: 'REAL_ESTATE', label: '부동산', emoji: '🏠' },
  { type: 'PENSION',     label: '연금',   emoji: '🛡️' },
  { type: 'SAVINGS',     label: '예적금', emoji: '💰' },
  { type: 'PHYSICAL',    label: '실물',   emoji: '💎' },
  { type: 'ETC',         label: '기타',   emoji: '🎵' },
]

/**
 * 자산 통합 페이지 — 유형 칩으로 기존 유형별 페이지를 그대로 표시.
 * 칩 선택값은 localStorage에 기억 (다음 방문 시 마지막 유형).
 */
export default function AssetsPage() {
  const [params] = useSearchParams()
  const initial = params.get('type') as AssetType | null
  const [type, setType] = useState<AssetType | 'ALL'>(
    initial ?? (localStorage.getItem('assets_tab') as AssetType | 'ALL') ?? 'STOCK',
  )

  useEffect(() => {
    localStorage.setItem('assets_tab', type)
  }, [type])

  return (
    <div>
      {/* 유형 칩 — 스크롤해도 상단 고정 */}
      <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-2 flex gap-1.5 overflow-x-auto no-scrollbar">
          {CHIPS.map((c) => (
            <button
              key={c.type}
              onClick={() => setType(c.type)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                type === c.type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 선택 유형의 기존 페이지 (그대로 재사용) */}
      {type === 'STOCK'       && <StockPage />}
      {type === 'REAL_ESTATE' && <RealEstatePage />}
      {type === 'PENSION'     && <PensionPage />}
      {type === 'SAVINGS'     && <AssetPage type="SAVINGS" />}
      {type === 'PHYSICAL'    && <AssetPage type="PHYSICAL" />}
      {type === 'ETC'         && <AssetPage type="ETC" />}
      {type === 'ALL'         && <AllSummary />}
    </div>
  )
}

/** 전체: 유형별 요약 카드 — 각 유형 타일 수와 총액, 탭하면 해당 유형으로 */
import { useAssets } from '@/hooks/useAssets'
import { formatManwon, TYPE_LABELS, TYPE_COLORS } from '@/lib/utils'

function AllSummary() {
  const { data: assets = [], isLoading } = useAssets()
  if (isLoading) return <div className="flex items-center justify-center h-40 text-gray-400">로딩 중...</div>

  const active = assets.filter((a) => !a.disposalDate)
  const byType = new Map<AssetType, { total: number; count: number }>()
  for (const a of active) {
    const cur = byType.get(a.type) ?? { total: 0, count: 0 }
    byType.set(a.type, { total: cur.total + a.currentValue, count: cur.count + 1 })
  }
  const types = Array.from(byType.entries()).sort((x, y) => y[1].total - x[1].total)
  const grand = types.reduce((s, [, v]) => s + v.total, 0)

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <p className="text-xs text-gray-500">총 자산</p>
        <p className="text-2xl font-bold text-gray-100 mt-1">{formatManwon(grand)}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {types.map(([t, v]) => (
          <div key={t} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[t] }} />
              <div>
                <p className="text-sm font-semibold text-gray-100">{TYPE_LABELS[t]}</p>
                <p className="text-xs text-gray-500">{v.count}개 자산</p>
              </div>
            </div>
            <p className="text-base font-bold text-gray-100">{formatManwon(v.total)}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-600 text-center">위 칩에서 유형을 선택하면 상세 관리로 들어갑니다.</p>
    </div>
  )
}
