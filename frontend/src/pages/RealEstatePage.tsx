import { useState } from 'react'
import { Plus, Home, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useAssets, useAssetsByType } from '@/hooks/useAssets'
import AssetCreateForm from '@/components/assets/AssetCreateForm'
import AssetChart from '@/components/common/AssetChart'
import AssetModal from '@/components/common/AssetModal'
import KpiCard from '@/components/common/KpiCard'
import { formatMoney, formatManwon } from '@/lib/utils'
import type { Asset, RealEstateDetail } from '@/types'

export default function RealEstatePage() {
  const assets = useAssetsByType('REAL_ESTATE')
  const { isLoading } = useAssets()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const selected = assets.find((a) => a.id === selectedId) ?? null

  const active = assets.filter((a) => !a.disposalDate)
  const sold   = assets.filter((a) => !!a.disposalDate)

  const totalVal  = active.reduce((s, a) => s + a.currentValue, 0)
  const totalLiab = active.reduce((s, a) => {
    const d = a.detail as RealEstateDetail | undefined
    return s + (d?.loanAmount ?? 0) + (d?.tenantDeposit ?? 0)
  }, 0)
  const netEquity = totalVal - totalLiab

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-100">🏠 부동산</h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> 신규 추가
        </button>
      </div>

      {showCreate && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <AssetCreateForm defaultType="REAL_ESTATE" onClose={() => setShowCreate(false)} />
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <KpiCard label="시세 총액"       value={formatMoney(totalVal)}    color="default" />
        <KpiCard label="부채 총계"       value={formatMoney(totalLiab)}   color="red"     />
        <KpiCard label="순자산 (Equity)" value={formatMoney(netEquity)}   color="blue"    />
      </div>

      {/* 성장 추이 */}
      {active.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">📈 시세 추이</h3>
          <AssetChart type="REAL_ESTATE" groupBy="name" defaultPeriod="10y" height={220} />
        </div>
      )}

      {/* 보유 타일 */}
      {active.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400">보유 ({active.length})</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map((a) => (
              <RealEstateTile key={a.id} asset={a} onClick={() => setSelectedId(a.id)} />
            ))}
          </div>
        </section>
      )}

      {/* 매각 타일 */}
      {sold.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400">매각 완료 ({sold.length})</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 opacity-55">
            {sold.map((a) => (
              <RealEstateTile key={a.id} asset={a} onClick={() => setSelectedId(a.id)} />
            ))}
          </div>
        </section>
      )}

      {active.length === 0 && sold.length === 0 && (
        <div className="text-center py-16 text-gray-500 bg-gray-800/50 rounded-xl border border-gray-700">
          등록된 부동산 자산이 없습니다.
        </div>
      )}

      {/* 모달 */}
      <AssetModal asset={selected} onClose={() => setSelectedId(null)} />
    </div>
  )
}

function RealEstateTile({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const d      = asset.detail as RealEstateDetail | undefined
  const isSold = !!asset.disposalDate
  const val    = isSold ? (asset.disposalPrice ?? 0) : asset.currentValue
  const liab   = (d?.loanAmount ?? 0) + (d?.tenantDeposit ?? 0)
  const equity = val - liab
  const cost   = asset.acquisitionPrice ?? 0
  const pnl    = val - cost
  const roi    = cost > 0 ? (pnl / cost) * 100 : 0

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-700 bg-gray-800
        hover:border-blue-500/60 hover:bg-gray-750 hover:shadow-lg hover:shadow-blue-500/5
        transition-all duration-200 p-4 space-y-3 group"
    >
      {/* 상단: 아이콘 + 이름 + 뱃지 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors shrink-0">
            <Home className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-100 truncate">{asset.name}</p>
            <p className="text-xs text-gray-500 truncate mt-0.5">{d?.address ?? '-'}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {d?.isOwned
            ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">자가</span>
            : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700 text-gray-400">임대</span>}
          {d?.hasTenant && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400">세입자</span>
          )}
          {isSold && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400">매각</span>
          )}
        </div>
      </div>

      {/* 현재 시세 */}
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{isSold ? '매각가' : '현재 시세'}</p>
        <p className="text-xl font-bold text-gray-100 tracking-tight">{formatManwon(val)}</p>
      </div>

      <div className="border-t border-gray-700/60" />

      {/* 하단 지표 2×2 */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-500 mb-0.5">순자산</p>
          <p className="text-blue-400 font-semibold">{formatManwon(equity)}</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">부채</p>
          <p className="text-red-400 font-semibold">{formatManwon(liab)}</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">취득가</p>
          <p className="text-gray-300">{formatManwon(cost)}</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">손익률</p>
          <div className="flex items-center gap-1">
            {pnl > 0 ? <TrendingUp className="w-3 h-3 text-emerald-400" />
              : pnl < 0 ? <TrendingDown className="w-3 h-3 text-red-400" />
              : <Minus className="w-3 h-3 text-gray-500" />}
            <span className={pnl > 0 ? 'text-emerald-400 font-semibold' : pnl < 0 ? 'text-red-400 font-semibold' : 'text-gray-500'}>
              {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
