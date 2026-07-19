import { useState } from 'react'
import { Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useAssets, useAssetsByType } from '@/hooks/useAssets'
import AssetCreateForm from '@/components/assets/AssetCreateForm'
import AssetChart from '@/components/common/AssetChart'
import AssetModal from '@/components/common/AssetModal'
import KpiCard from '@/components/common/KpiCard'
import OwnershipBadge from '@/components/common/OwnershipBadge'
import { formatMoney, formatManwon, formatPnl, TYPE_LABELS } from '@/lib/utils'
import type { AssetType, Asset } from '@/types'

interface Props { type: AssetType }

export default function AssetPage({ type }: Props) {
  const assets = useAssetsByType(type)
  const { isLoading } = useAssets()
  const [modalId,    setModalId]    = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const modalAsset = assets.find((a) => a.id === modalId) ?? null

  const active = assets.filter((a) => !a.disposalDate)
  const sold   = assets.filter((a) => !!a.disposalDate)
  const isQtyBased = type === 'STOCK' || type === 'PHYSICAL'

  const totalVal  = active.reduce((s, a) => s + a.currentValue, 0)
  const totalCost = active.reduce((s, a) =>
    isQtyBased
      ? s + (a.acquisitionPrice ?? 0) * (a.quantity ?? 0)
      : s + (a.acquisitionPrice ?? 0)
  , 0)
  const pnl = totalVal - totalCost
  const roi = totalCost > 0 ? (pnl / totalCost) * 100 : 0

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-100">{TYPE_LABELS[type]}</h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> 신규 추가
        </button>
      </div>

      {showCreate && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <AssetCreateForm defaultType={type} onClose={() => setShowCreate(false)} />
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <KpiCard label="평가 총액" value={formatMoney(totalVal)} color="default" />
        <KpiCard label="투자 원금" value={formatMoney(totalCost)} color="default" />
        <KpiCard
          label="평가 손익"
          value={`${formatPnl(pnl)} (${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%)`}
          color={pnl >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* 성장 추이 */}
      {active.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">📈 성장 추이</h3>
          <AssetChart type={type} groupBy="name" defaultPeriod="3y" height={200} />
        </div>
      )}

      {/* 보유 타일 */}
      {active.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400">
            보유 ({active.length})
            <span className="ml-1.5 text-gray-600">· 클릭하면 상세 확인</span>
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map((a) => (
              <AssetTile key={a.id} asset={a} isQtyBased={isQtyBased} onClick={() => setModalId(a.id)} />
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
              <AssetTile key={a.id} asset={a} isQtyBased={isQtyBased} onClick={() => setModalId(a.id)} />
            ))}
          </div>
        </section>
      )}

      {active.length === 0 && sold.length === 0 && (
        <div className="text-center py-16 text-gray-500 bg-gray-800/50 rounded-xl border border-gray-700">
          등록된 자산이 없습니다. 신규 추가 버튼을 눌러 등록하세요.
        </div>
      )}

      <AssetModal asset={modalAsset} onClose={() => setModalId(null)} />
    </div>
  )
}

function AssetTile({
  asset, isQtyBased, onClick,
}: {
  asset: Asset
  isQtyBased: boolean
  onClick: () => void
}) {
  const isSold = !!asset.disposalDate
  const val    = isSold ? (asset.disposalPrice ?? 0) : asset.currentValue
  const cost   = isQtyBased
    ? (asset.acquisitionPrice ?? 0) * (asset.quantity ?? 0)
    : (asset.acquisitionPrice ?? 0)
  const pnl = val - cost
  const roi = cost > 0 ? (pnl / cost) * 100 : 0

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-700 bg-gray-800
        hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/5
        transition-all duration-200 p-4 space-y-3 group"
    >
      {/* 상단: 손익 인디케이터 + 이름 */}
      <div className="flex items-start gap-3">
        <div className={`w-1 self-stretch rounded-full shrink-0 mt-0.5 ${
          pnl > 0 ? 'bg-emerald-500' : pnl < 0 ? 'bg-red-500' : 'bg-gray-600'
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-100 truncate group-hover:text-blue-300 transition-colors">
            {asset.name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
            <span>{asset.acquisitionDate ?? '-'} 취득</span>
            {isSold && <span className="text-red-400">· 매각</span>}
            <OwnershipBadge ownership={asset.ownership} />
          </p>
        </div>
      </div>

      {/* 현재 가치 */}
      <div>
        <p className="text-lg font-bold text-gray-100 tracking-tight">{formatManwon(val)}</p>
        {isQtyBased && (
          <p className="text-xs text-gray-500 mt-0.5">{(asset.quantity ?? 0).toLocaleString()} 보유</p>
        )}
      </div>

      <div className="border-t border-gray-700/60" />

      {/* 하단 손익 */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">원금</p>
          <p className="text-xs text-gray-400">{formatManwon(cost)}</p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 mb-0.5">
            {pnl > 0
              ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              : pnl < 0
              ? <TrendingDown className="w-3.5 h-3.5 text-red-400" />
              : <Minus className="w-3.5 h-3.5 text-gray-500" />}
            <span className={`text-sm font-bold ${
              pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-gray-500'
            }`}>
              {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
            </span>
          </div>
          <p className={`text-xs ${pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-gray-500'}`}>
            {pnl >= 0 ? '+' : ''}{formatManwon(pnl)}
          </p>
        </div>
      </div>
    </button>
  )
}
