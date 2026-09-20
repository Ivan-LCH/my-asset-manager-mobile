import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useAssets, useAssetsByType } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import AssetCreateForm from '@/components/assets/AssetCreateForm'
import AssetModal from '@/components/common/AssetModal'
import KpiCard from '@/components/common/KpiCard'
import OwnershipBadge from '@/components/common/OwnershipBadge'
import { EMPTY_PENSION_PLAN, sourcesFromAssets } from '@/lib/pensionSim'
import { resolveAge, resolveRetirementYear } from '@/lib/people'
import { formatMoney, formatManwon, cn } from '@/lib/utils'
import type { Asset, PensionDetail, StockDetail, SavingsDetail, PensionSimPlan, PensionTaxType } from '@/types'

const SIM_START_YEAR = 2029
const AREA_COLORS = ['#60a5fa', '#34d399', '#fb923c', '#c084fc', '#f87171', '#a3e635', '#fbbf24', '#22d3ee']

const TAX_LABELS: Record<PensionTaxType, string> = {
  irp: 'IRP', national: '국민연금', taxable: '과세', taxExempt: '비과세',
}
const TAX_ACTIVE: Record<PensionTaxType, string> = {
  irp: 'bg-blue-600 text-white',
  national: 'bg-cyan-600 text-white',
  taxable: 'bg-orange-600 text-white',
  taxExempt: 'bg-emerald-600 text-white',
}

interface SimRow { year: number; total: number; [source: string]: number }

/** 과세구분 칩 선택 → plan.sources 반영 (순수 계산) */
const applyTaxType = (
  p: PensionSimPlan, assetId: string, taxType: PensionTaxType, pensionAssets: Asset[],
): PensionSimPlan => {
  const exists = p.sources.some((s) => s.id === assetId)
  if (exists) {
    return { ...p, sources: p.sources.map((s) => s.id === assetId ? { ...s, taxType, taxTypeManual: true } : s) }
  }
  const asset = pensionAssets.find((a) => a.id === assetId)
  if (!asset) return p
  return { ...p, sources: [...p.sources, {
    id: assetId, name: asset.name, principal: asset.currentValue, taxType, taxTypeManual: true, yieldRate: 4, owner: 'husband',
  }] }
}

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

interface SimTooltipProps { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }
function SimTooltip({ active, payload, label }: SimTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-xl p-3 shadow-2xl min-w-[180px]">
      <p className="text-xs text-gray-400 mb-2 font-medium">{label}년</p>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-300">{p.name}</span>
            <span className="text-xs text-gray-100">{formatMoney(p.value)}/월</span>
          </div>
        ))}
        <div className="border-t border-gray-700 pt-1">
          <span className="text-xs text-gray-400">합계</span>
          <span className="text-[12px] text-blue-400 ml-2">{formatMoney(total)}/월</span>
        </div>
      </div>
    </div>
  )
}

// ── 메인 ───────────────────────────────────────────────────
export default function PensionPage() {
  const pensionAssets = useAssetsByType('PENSION')
  const stockAssets = useAssetsByType('STOCK')
  const stockByAccount = new Map<string, { total: number; name: string }>()
  for (const s of stockAssets) {
    const acct = (s.detail as { accountName?: string } | undefined)?.accountName ?? ''
    if (acct) {
      const cur = stockByAccount.get(acct) ?? { total: 0, name: s.name }
      stockByAccount.set(acct, { total: cur.total + s.currentValue, name: s.name })
    }
  }
  const { data: allAssets = [], isLoading: loadPension } = useAssets()
  const { data: settings } = useSettings()
  const { data: savedSim } = usePensionSim()
  const saveSimMut = useSavePensionSim()
  const navigate = useNavigate()

  const [modalId, setModalId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [simPlan, setSimPlan] = useState<PensionSimPlan>(EMPTY_PENSION_PLAN)

  // PensionSim 로드 + PENSION 자산 자동 병합
  // savedSim(undefined=로딩중)가 해결되고 자산도 로드된 후 1회 실행.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    if (savedSim === undefined) return       // sim plan 아직 로딩 중
    if (pensionAssets.length === 0 && savedSim === null) return  // 둘 다 비어있으면 대기
    didInit.current = true
    const base = savedSim ?? EMPTY_PENSION_PLAN
    const currentSources = base.sources ?? []
    const auto = sourcesFromAssets(
      pensionAssets.map((a) => ({
        id: a.id, name: a.name, currentValue: a.currentValue,
        detail: { pensionType: (a.detail as { pensionType?: string })?.pensionType },
      })),
      currentSources,
    )
    const manual = currentSources.filter((s) => !pensionAssets.find((a) => a.id === s.id))
    setSimPlan({ ...EMPTY_PENSION_PLAN, ...base, sources: [...auto, ...manual] })
  }, [savedSim, pensionAssets])

  // 칩 선택 = 즉시 저장 (별도 저장 버튼 없음 — UI 간소화 ③)
  const updateSourceTaxType = (assetId: string, taxType: PensionTaxType) => {
    const next = applyTaxType(simPlan, assetId, taxType, pensionAssets)
    setSimPlan(next)
    saveSimMut.mutate(next)
  }

  const modalAsset = allAssets.find((a) => a.id === modalId) ?? null
  const currentAge = resolveAge(settings)
  // 은퇴 연령 = 현재 나이 + (은퇴 예정 연도 − 올해). resolveRetirementYear은 '연도'를 반환하므로 나이에서 직접 빼면 안 됨
  const retirementAge = currentAge + Math.max(0, resolveRetirementYear(settings) - new Date().getFullYear())
  const pensionLikeAssets = allAssets.filter((a) => {
    if (a.type === 'PENSION') return true
    if ((a.type === 'STOCK' || a.type === 'SAVINGS') && (a.detail as StockDetail & SavingsDetail)?.isPensionLike) return true
    return false
  })
  const active = pensionAssets.filter((a) => !a.disposalDate)

  if (loadPension) {
    return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100">🛡️ 연금</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/analysis?tab=pension-sim')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 transition-colors"
          >
            연금 분석 보기
          </button>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <Plus className="w-4 h-4" /> 신규 추가
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <AssetCreateForm defaultType="PENSION" onClose={() => setShowCreate(false)} />
        </div>
      )}

      <section className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2"><h3 className="font-semibold">현재 연금 계약·등록 지급 목표</h3><p className="text-sm text-gray-400">아래 월 지급액은 등록 목표입니다. 이 입력과 기존 연금 설정은 분석에서 재사용합니다. 실제 수령액은 잔액·지급 조건·세금에 따라 달라집니다.</p><button className="text-blue-300 underline p-2" onClick={()=>navigate('/analysis')}>은퇴 분석 요약 보기 →</button></section>

      {/* 연금 자산 타일 (과세구분 버튼 포함) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400">
          연금 자산 ({active.length})
          <span className="ml-1.5 text-gray-500">· IRP 재원·합산은 연금 분석에서 설정</span>
        </h3>
        {active.length === 0 && (
          <div className="text-center py-12 text-gray-500 bg-gray-800/50 rounded-xl border border-gray-700">
            등록된 연금 자산이 없습니다.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {active.map((a) => {
            const d = a.detail as PensionDetail | undefined
            const monthly = d?.expectedMonthlyPayout ?? 0
            const growth = d?.annualGrowthRate ?? 0
            const simSrc = simPlan.sources.find((s) => s.id === a.id)
            const taxType = simSrc?.taxType ?? 'taxable'

            return (
              <div key={a.id}
                className="rounded-xl border border-gray-700 bg-gray-800 hover:border-blue-500/60 transition-all duration-200 p-3.5 group cursor-pointer"
                onClick={() => setModalId(a.id)}
              >
                {/* 헤더: 이름/종류 + 월 수령액 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-100 truncate group-hover:text-blue-300 transition-colors">{a.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">{d?.pensionType ?? '연금'}<OwnershipBadge ownership={a.ownership} /></p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-500">월 수령</p>
                    <p className="text-base font-bold text-gray-100 tracking-tight">{formatMoney(monthly)}</p>
                  </div>
                </div>

                {/* 하단: 수령 기간 + 현재가치 + 연증가율 */}
                <div className="grid grid-cols-3 gap-2 mt-2.5 pt-2.5 border-t border-gray-700/60 text-xs">
                  <div className="min-w-0">
                    <p className="text-gray-500 mb-0.5">수령 기간</p>
                    <p className="text-gray-300 truncate">
                      {d?.expectedStartYear || '-'}~{d?.expectedEndYear || '-'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-gray-500 mb-0.5">현재 가치</p>
                    {(() => {
                      const acct = (d as { linkedStockId?: string } | undefined)?.linkedStockId
                      const linked = acct ? stockByAccount.get(acct) : undefined
                      return linked ? (
                        <>
                          <p className="text-emerald-400 truncate">{formatManwon(linked.total)}</p>
                          <p className="text-xs text-emerald-500/80 truncate">연동: {acct}</p>
                        </>
                      ) : (
                        <p className="text-gray-300 truncate">{formatManwon(a.currentValue)}</p>
                      )
                    })()}
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">연 증가율</p>
                    <p className="text-blue-400 font-semibold">{growth}%</p>
                  </div>
                </div>

                {/* 과세 구분 */}
                <div className="pt-2 mt-2 border-t border-gray-700/60" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs text-gray-500 mb-1">과세 구분</p>
                  <div className="flex gap-1 flex-wrap">
                    {(['irp', 'national', 'taxable', 'taxExempt'] as PensionTaxType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => updateSourceTaxType(a.id, t)}
                        className={cn('px-1.5 py-0.5 text-xs rounded transition-colors',
                          taxType === t ? TAX_ACTIVE[t] : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}
                      >
                        {TAX_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 연금형 포함 자산 */}
      {pensionLikeAssets.filter((a) => a.type !== 'PENSION').length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">연금형 포함 자산</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pensionLikeAssets.filter((a) => a.type !== 'PENSION').map((a) => (
              <button key={a.id} onClick={() => setModalId(a.id)}
                className="text-left bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 hover:border-blue-500/60 transition-all group">
                <p className="text-sm font-semibold text-gray-200 group-hover:text-blue-300 transition-colors">{a.name}</p>
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
