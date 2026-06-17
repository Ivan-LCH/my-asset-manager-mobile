import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useAssets, useAssetsByType } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import AssetCreateForm from '@/components/assets/AssetCreateForm'
import AssetModal from '@/components/common/AssetModal'
import KpiCard from '@/components/common/KpiCard'
import { formatMoney, formatManwon } from '@/lib/utils'
import type { Asset, PensionDetail, StockDetail, SavingsDetail } from '@/types'

const SIM_START_YEAR = 2029
const AREA_COLORS = ['#60a5fa', '#34d399', '#fb923c', '#c084fc', '#f87171', '#a3e635', '#fbbf24', '#22d3ee']

interface SimRow { year: number; total: number; [source: string]: number }

function buildSimulation(assets: Asset[], currentAge: number, retirementAge: number): {
  rows: SimRow[]
  sources: string[]
} {
  const currentYear = new Date().getFullYear()
  const startYear = Math.min(SIM_START_YEAR, currentYear + (retirementAge - currentAge))
  const endYear = currentYear + (100 - currentAge)
  const sourceSet = new Set<string>()
  const rows: SimRow[] = []

  for (let year = startYear; year <= endYear; year++) {
    const row: SimRow = { year, total: 0 }

    for (const a of assets) {
      if (a.type === 'PENSION') {
        const d = a.detail as PensionDetail | undefined
        if (!d) continue
        if (year >= d.expectedStartYear && year <= d.expectedEndYear) {
          const yearsElapsed = year - d.expectedStartYear
          const payout = d.expectedMonthlyPayout * Math.pow(1 + (d.annualGrowthRate ?? 0) / 100, yearsElapsed)
          row[a.name] = (row[a.name] ?? 0) + payout
          row.total += payout
          sourceSet.add(a.name)
        }
      }
      if (a.type === 'STOCK' || a.type === 'SAVINGS') {
        const d = a.detail as (StockDetail & SavingsDetail) | undefined
        if (!d?.isPensionLike) continue
        if (d.pensionStartYear && year >= d.pensionStartYear) {
          const payout = d.pensionMonthly ?? 0
          row[a.name] = (row[a.name] ?? 0) + payout
          row.total += payout
          sourceSet.add(a.name)
        }
      }
    }

    rows.push(row)
  }

  return { rows, sources: Array.from(sourceSet) }
}

interface SimTooltipProps {
  active?:  boolean
  payload?: { name: string; value: number; color: string }[]
  label?:   number
}

function SimTooltip({ active, payload, label }: SimTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  const visible = payload.filter((p) => p.value > 0)
  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-xl p-3 shadow-2xl min-w-[180px]">
      <p className="text-[11px] text-gray-400 mb-2 font-medium">{label}년</p>
      <div className="space-y-1.5">
        {visible.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="text-[11px] text-gray-300 truncate">{p.name}</span>
            </div>
            <span className="text-[11px] font-semibold text-gray-100 shrink-0">{formatManwon(p.value)}/월</span>
          </div>
        ))}
      </div>
      {visible.length > 1 && (
        <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">합계</span>
          <span className="text-[12px] font-bold text-blue-400">{formatManwon(total)}/월</span>
        </div>
      )}
    </div>
  )
}

export default function PensionPage() {
  const pensionAssets = useAssetsByType('PENSION')
  const { data: allAssets = [], isLoading: loadPension } = useAssets()

  const { data: settings } = useSettings()

  const [modalId,    setModalId]    = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const modalAsset = allAssets.find((a) => a.id === modalId) ?? null

  const currentAge    = settings?.currentAge    ?? 40
  const retirementAge = settings?.retirementAge ?? 65

  // 연금 시뮬레이션 대상: PENSION + 연금형 STOCK/SAVINGS
  const pensionLikeAssets = allAssets.filter((a) => {
    if (a.type === 'PENSION') return true
    if ((a.type === 'STOCK' || a.type === 'SAVINGS') && (a.detail as StockDetail & SavingsDetail)?.isPensionLike) return true
    return false
  })

  const { rows: simData, sources: simSources } = buildSimulation(pensionLikeAssets, currentAge, retirementAge)
  const peakMonthly = Math.max(...simData.map((r) => r.total), 0)
  const retirementYear = new Date().getFullYear() + (retirementAge - currentAge)
  const retirementRow = simData.find((r) => r.year >= retirementYear)

  const active = pensionAssets.filter((a) => !a.disposalDate)

  if (loadPension) {
    return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-100">🛡️ 연금</h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> 신규 추가
        </button>
      </div>

      {showCreate && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <AssetCreateForm defaultType="PENSION" onClose={() => setShowCreate(false)} />
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard
          label="은퇴 시 월 수령 (예상)"
          value={retirementRow ? formatMoney(retirementRow.total) : '-'}
          color="blue"
        />
        <KpiCard
          label="최대 월 수령"
          value={formatMoney(peakMonthly)}
          color="green"
        />
        <KpiCard
          label="연금 자산 수"
          value={`${pensionLikeAssets.length}개`}
          color="default"
        />
      </div>

      {/* 시뮬레이션 차트 */}
      {simData.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-1">📊 연금 수령 시뮬레이션</h3>
          <p className="text-xs text-gray-500 mb-4">
            은퇴 연령 {retirementAge}세 기준 · 현재 연령 {currentAge}세 · {SIM_START_YEAR}년부터 표시
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={simData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="year"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickLine={false} axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false} axisLine={false}
                tickFormatter={(v: number) => `${Math.round(v / 1000).toLocaleString()}천`}
                width={40}
              />
              <Tooltip content={<SimTooltip />} />
              {simSources.length > 1 && (
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: 8 }} />
              )}
              {simSources.map((src, i) => (
                <Bar
                  key={src}
                  dataKey={src}
                  stackId="1"
                  fill={AREA_COLORS[i % AREA_COLORS.length]}
                  radius={i === simSources.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 연금 자산 타일 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400">
          연금 자산 ({active.length})
          <span className="ml-1.5 text-gray-600">· 클릭하면 상세 확인</span>
        </h3>
        {active.length === 0 && (
          <div className="text-center py-12 text-gray-500 bg-gray-800/50 rounded-xl border border-gray-700">
            등록된 연금 자산이 없습니다.
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {active.map((a) => (
            <PensionTile key={a.id} asset={a} onClick={() => setModalId(a.id)} />
          ))}
        </div>
      </section>

      {/* 연금형 포함 자산 (연금 외) */}
      {pensionLikeAssets.filter((a) => a.type !== 'PENSION').length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">연금형 포함 자산</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {pensionLikeAssets
              .filter((a) => a.type !== 'PENSION')
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => setModalId(a.id)}
                  className="text-left bg-gray-800 border border-gray-700 rounded-xl px-4 py-3
                    hover:border-blue-500/60 transition-all group"
                >
                  <p className="text-sm font-semibold text-gray-200 group-hover:text-blue-300 transition-colors">
                    {a.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.type}</p>
                </button>
              ))}
          </div>
        </section>
      )}

      <AssetModal asset={modalAsset} onClose={() => setModalId(null)} />
    </div>
  )
}

function PensionTile({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const d = asset.detail as PensionDetail | undefined
  const monthly = d?.expectedMonthlyPayout ?? 0
  const growth  = d?.annualGrowthRate ?? 0

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-700 bg-gray-800
        hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/5
        transition-all duration-200 p-4 space-y-3 group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-100 truncate group-hover:text-blue-300 transition-colors">
            {asset.name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{d?.pensionType ?? '연금'}</p>
        </div>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/20 text-orange-400 shrink-0">
          연금
        </span>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-0.5">월 수령 예상액</p>
        <p className="text-xl font-bold text-gray-100 tracking-tight">
          {formatMoney(monthly)}
          <span className="text-xs text-gray-500 font-normal ml-1">/월</span>
        </p>
      </div>

      <div className="border-t border-gray-700/60" />

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-500 mb-0.5">개시 연도</p>
          <p className="text-gray-300 font-medium">{d?.expectedStartYear ?? '-'}년</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">종료 연도</p>
          <p className="text-gray-300 font-medium">{d?.expectedEndYear ?? '-'}년</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">연 증가율</p>
          <p className="text-blue-400 font-semibold">{growth}%</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">현재 가치</p>
          <p className="text-gray-300">{formatManwon(asset.currentValue)}</p>
        </div>
      </div>
    </button>
  )
}
