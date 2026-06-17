import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import KpiCard from '@/components/common/KpiCard'
import AssetChart from '@/components/common/AssetChart'
import { useAssets } from '@/hooks/useAssets'
import { formatMoney, formatManwon, TYPE_LABELS, TYPE_COLORS } from '@/lib/utils'
import type { AssetType } from '@/types'

export default function Dashboard() {
  const { data: assets = [], isLoading } = useAssets()

  const active = assets.filter((a) => !a.disposalDate)

  let totalAsset = 0, totalLiab = 0
  for (const a of active) {
    totalAsset += a.currentValue
    if (a.type === 'REAL_ESTATE' && a.detail) {
      const d = a.detail as { loanAmount?: number; tenantDeposit?: number }
      totalLiab += (d.loanAmount ?? 0) + (d.tenantDeposit ?? 0)
    }
  }
  const netWorth = totalAsset - totalLiab

  const pieMap: Partial<Record<AssetType, number>> = {}
  for (const a of active) {
    pieMap[a.type] = (pieMap[a.type] ?? 0) + a.currentValue
  }
  const pieData = Object.entries(pieMap)
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({
      name:  TYPE_LABELS[type as AssetType],
      value,
      type:  type as AssetType,
    }))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        로딩 중...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <h2 className="text-xl font-bold text-gray-100">📊 통합 자산 대시보드</h2>

      {/* KPI 카드 */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <KpiCard label="💰 총 자산"  value={formatMoney(totalAsset)} color="default" />
        <KpiCard label="📉 총 부채"  value={formatMoney(totalLiab)}  color="red"     />
        <KpiCard label="💎 순 자산"  value={formatMoney(netWorth)}   color="blue"    />
      </div>

      {/* 자산 비중 — 1줄 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">📊 자산 비중</h3>
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="w-full md:w-72 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.type} fill={TYPE_COLORS[entry.type]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#f3f4f6' }}
                  itemStyle={{ color: '#e5e7eb' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(v: number) => formatManwon(v)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* 범례 + 비율 테이블 */}
          <div className="flex-1 w-full space-y-2">
            {pieData
              .sort((a, b) => b.value - a.value)
              .map((entry) => {
                const pct = totalAsset > 0 ? (entry.value / totalAsset) * 100 : 0
                return (
                  <div key={entry.type} className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: TYPE_COLORS[entry.type] }}
                    />
                    <span className="text-xs text-gray-400 w-20 sm:w-28 truncate">{entry.name}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: TYPE_COLORS[entry.type] }}
                      />
                    </div>
                    <span className="text-xs text-gray-300 w-12 text-right">{pct.toFixed(1)}%</span>
                    <span className="text-xs text-gray-500 w-24 text-right hidden md:block">{formatManwon(entry.value)}</span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* 자산 성장 추이 — 1줄 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">📈 자산 성장 추이</h3>
        <AssetChart groupBy="type" defaultPeriod="10y" height={260} />
      </div>
    </div>
  )
}
