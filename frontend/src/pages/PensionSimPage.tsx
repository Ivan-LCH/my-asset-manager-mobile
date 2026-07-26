// 연금 시뮬레이션 — 법인시뮬과 대칭되는 "연금·개인 vehicle" 모델. 1인(남편/와이프) 과세.
// 일반주식계좌 잔액 = stock 유입 합, 종목 기반 배당률(자동+수동폴백), 명의 프리셋.
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ChevronDown, AlertTriangle, Trash2, ArrowLeft, Plus } from 'lucide-react'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import { useRetirement } from '@/hooks/useRetirement'
import { useAssetsByType } from '@/hooks/useAssets'
import {
  EMPTY_PENSION_PLAN, computePensionVehiclePerPerson, computePerPersonComprehensiveDeduction,
  stockBalanceFromInflows, stockAccountYield, totalInflows, sourcesFromAssets, pensionSchedule,
  FINANCIAL_INCOME_LIMIT,
} from '@/lib/pensionSim'
import { realEstatePropertyBases, calcHealthInsurance } from '@/lib/healthInsurance'
import { blendedYield } from '@/lib/corpSim'
import { formatManwon, cn } from '@/lib/utils'
import {
  type PensionSimPlan, type Ownership, type OwnershipPreset,
  type PensionDetail,
  ownershipFromPreset, presetFromOwnership,
} from '@/types'

const uid = () => Math.random().toString(36).slice(2, 9)

// ── 헬퍼 ───────────────────────────────────────────────────
function numFmt(v: number) { return v > 0 ? Math.round(v).toLocaleString() : '' }
function parseNum(s: string) { return Number(s.replace(/,/g, '')) || 0 }

function Expander({ title, badge, children, defaultOpen = false }: {
  title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 text-left hover:bg-gray-750 transition-colors">
        <span className="text-sm font-semibold text-gray-200">{title}</span>
        <div className="flex items-center gap-2 shrink-0">
          {badge && <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full whitespace-nowrap">{badge}</span>}
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-gray-700 space-y-3">{children}</div>}
    </div>
  )
}

function AmountInput({ value, onChange, placeholder = '금액' }: {
  value: number; onChange: (v: number) => void; placeholder?: string
}) {
  const [raw, setRaw] = useState(value > 0 ? numFmt(value) : '')
  useEffect(() => { setRaw(value > 0 ? numFmt(value) : '') }, [value])
  return (
    <input type="text" inputMode="numeric"
      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
      placeholder={placeholder} value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => { const n = parseNum(raw); onChange(n); setRaw(n > 0 ? numFmt(n) : '') }}
    />
  )
}

function NumInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-1">
      <input type="number" inputMode="decimal"
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
        value={value || ''} onChange={(e) => onChange(Number(e.target.value))} />
      {suffix && <span className="text-xs text-gray-500 shrink-0">{suffix}</span>}
    </div>
  )
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-400 shrink-0">{label}</span>
        <div className="w-40 sm:w-48 shrink-0">{children}</div>
      </div>
      {hint && <p className="text-[11px] text-gray-600 mt-0.5 sm:text-right sm:mr-48">{hint}</p>}
    </div>
  )
}

/** 명의 프리셋 버튼행 */
function OwnershipPreset({ value, onChange, disabled, locked }: {
  value: Ownership; onChange: (o: Ownership) => void; disabled?: boolean; locked?: string
}) {
  const preset = presetFromOwnership(value)
  const labels: Record<OwnershipPreset, string> = { mine: '내 100%', half: '50:50', wife: '와이프 100%', custom: '직접' }
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {(['mine', 'half', 'wife', 'custom'] as OwnershipPreset[]).map((p) => (
          <button key={p} disabled={disabled}
            onClick={() => onChange(ownershipFromPreset(p))}
            className={cn('flex-1 px-1.5 py-0.5 text-[10px] rounded transition-colors',
              preset === p ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600',
              disabled && 'opacity-40 cursor-not-allowed')}>
            {labels[p]}
          </button>
        ))}
      </div>
      {preset === 'custom' && !disabled && (
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-[10px] text-gray-500">
            남편<NumInput value={value.husband} onChange={(v) => onChange({ husband: Math.min(100, Math.max(0, v)), wife: 100 - Math.min(100, Math.max(0, v)) })} suffix="%" />
          </label>
        </div>
      )}
      {locked && <p className="text-[10px] text-gray-600">{locked}</p>}
    </div>
  )
}

// ── 목돈 분배 카드 ──────────────────────────────────────────
// 퇴직IRP는 퇴직금(severance)일 때만 적용. 일반계좌는 항상. 나머지는 자동으로 현금보유.
function AllocationCard({ lumpsum, allocation, onChange }: {
  lumpsum: { id: string; name: string; amount: number; receiveYear: number; taxKind?: string }
  allocation: { irpAmount: number; stockAmount: number }
  onChange: (patch: Partial<{ irpAmount: number; stockAmount: number }>) => void
}) {
  const isSeverance = lumpsum.taxKind === 'severance'
  const irp = isSeverance ? allocation.irpAmount : 0   // 퇴직금 아니면 IRP 경로 없음
  const cash = Math.max(0, lumpsum.amount - irp - allocation.stockAmount)
  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-200 font-medium truncate">{lumpsum.name || '목돈'}</span>
        <span className="text-sm text-gray-100 font-semibold shrink-0">{formatManwon(lumpsum.amount)}</span>
      </div>
      <p className="text-[10px] text-gray-600">{lumpsum.receiveYear}년 일회 수령{lumpsum.taxKind === 'severance' ? ' · 퇴직소득세 적용(현금분)' : ''}</p>
      <div className={isSeverance ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
        {isSeverance && (
          <div>
            <p className="text-[10px] text-gray-500 mb-0.5">→ 퇴직IRP (연금으로 굴림)</p>
            <AmountInput value={allocation.irpAmount} onChange={(v) => onChange({ irpAmount: v })} />
          </div>
        )}
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">→ 일반주식계좌 (배당)</p>
          <AmountInput value={allocation.stockAmount} onChange={(v) => onChange({ stockAmount: v })} />
        </div>
      </div>
      <p className="text-[11px] text-gray-500">
        나머지(현금보유) <span className="text-gray-300 font-semibold">{formatManwon(cash)}</span>
        {cash > 0 && <span className="text-gray-600"> → 은퇴계획 목돈 수입</span>}
      </p>
    </div>
  )
}

// ── 메인 ───────────────────────────────────────────────────
export default function PensionSimPage() {
  const navigate = useNavigate()
  const { data: saved } = usePensionSim()
  const saveMut = useSavePensionSim()
  const pensionAssets = useAssetsByType('PENSION')
  const stockAssets = useAssetsByType('STOCK')
  const realEstateAssets = useAssetsByType('REAL_ESTATE')
  const { data: retirement } = useRetirement()
  // 주식계좌 현재가치 맵 — 계좌명(accountName) 기준 총액 (연금 자산 연동 시)
  const stockByAccount = new Map<string, number>()
  for (const s of stockAssets) {
    const acct = (s.detail as { accountName?: string } | undefined)?.accountName ?? ''
    if (acct) stockByAccount.set(acct, (stockByAccount.get(acct) ?? 0) + s.currentValue)
  }

  const [plan, setPlan] = useState<PensionSimPlan>(EMPTY_PENSION_PLAN)
  const [dirty, setDirty] = useState(false)
  const [yieldLoading, setYieldLoading] = useState(false)
  const [yieldErr, setYieldErr] = useState('')

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    if (saved === undefined) return
    if (pensionAssets.length === 0 && saved === null) return
    didInit.current = true
    const base = saved ?? EMPTY_PENSION_PLAN
    const auto = sourcesFromAssets(
      pensionAssets.map((a) => ({
        id: a.id, name: a.name, currentValue: a.currentValue,
        detail: {
          pensionType: (a.detail as { pensionType?: string })?.pensionType,
          linkedStockId: (a.detail as { linkedStockId?: string })?.linkedStockId,
        },
      })),
      base.sources,
      stockByAccount,
    )
    const manual = base.sources.filter((s) => !pensionAssets.find((a) => a.id === s.id))
    const loadedHoldings = base.stockHoldings ?? []
    setPlan({
      ...EMPTY_PENSION_PLAN, ...base,
      sources: [...auto, ...manual],
      allocations: base.allocations ?? [],
      stockHoldings: loadedHoldings,
      stockYields: base.stockYields ?? [],
      stockOwnership: base.stockOwnership ?? { husband: 50, wife: 50 },
    })
    // name이 없는 기존 종목들 자동 fetch
    const toFetch = loadedHoldings.filter((h) => h.ticker && !h.name)
    if (toFetch.length > 0) {
      void (async () => {
        const updated = [...loadedHoldings]
        for (const h of toFetch) {
          try {
            const r = await fetch(`/api/yield?ticker=${encodeURIComponent(h.ticker)}`)
            if (!r.ok) continue
            const d = await r.json()
            const idx = updated.findIndex((x) => x.ticker === h.ticker)
            if (idx >= 0 && d.name) updated[idx] = { ...updated[idx], name: d.name }
          } catch { /* skip */ }
        }
        setPlan((p) => ({ ...p, stockHoldings: updated }))
      })()
    }
  }, [saved, pensionAssets])

  const update = useCallback(<K extends keyof PensionSimPlan>(key: K, val: PensionSimPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])

  // 목돈 분배 (lumpsumId 단위 upsert: 퇴직IRP/일반주식계좌 금액)
  const setAllocation = (lumpsumId: string, patch: Partial<{ irpAmount: number; stockAmount: number }>) => {
    setPlan((p) => {
      const exists = p.allocations.some((a) => a.lumpsumId === lumpsumId)
      const allocations = exists
        ? p.allocations.map((a) => a.lumpsumId === lumpsumId ? { ...a, ...patch } : a)
        : [...p.allocations, { lumpsumId, irpAmount: 0, stockAmount: 0, ...patch }]
      return { ...p, allocations }
    })
    setDirty(true)
  }

  // 종목(홀딩) 관리
  const addHolding = () => {
    setPlan((p) => ({ ...p, stockHoldings: [...p.stockHoldings, { ticker: '', weight: 1 }] }))
    setDirty(true)
  }
  const updateHolding = (idx: number, patch: Partial<{ ticker: string; weight: number; growthRate: number }>) => {
    setPlan((p) => ({ ...p, stockHoldings: p.stockHoldings.map((h, i) => i === idx ? { ...h, ...patch } : h) }))
    setDirty(true)
  }
  // 단일 종목 자동 산정 — 티커 입력/Enter 시 배당률+상승률 fetch & 저장
  const autoFetchHolding = async (ticker: string, idx: number) => {
    try {
      const r = await fetch(`/api/yield?ticker=${encodeURIComponent(ticker)}`)
      if (!r.ok) return
      const d = await r.json()
      setPlan((p) => {
        const newYields = [...p.stockYields]
        const yi = newYields.findIndex((y) => y.ticker === ticker)
        const yieldVal = d.avg3yYield ?? 0
        if (yieldVal > 0) {
          if (yi >= 0) newYields[yi] = { ticker, yield: yieldVal, manual: false }
          else newYields.push({ ticker, yield: yieldVal, manual: false })
        }
        const newHoldings = p.stockHoldings.map((h, i) =>
          i === idx ? { ...h, growthRate: d.avg3yGrowth ?? h.growthRate, name: d.name ?? h.name } : h
        )
        return { ...p, stockYields: newYields, stockHoldings: newHoldings }
      })
      setDirty(true)
    } catch { /* 폴백: 수동 입력 대기 */ }
  }
  const removeHolding = (idx: number) => {
    setPlan((p) => ({ ...p, stockHoldings: p.stockHoldings.filter((_, i) => i !== idx) }))
    setDirty(true)
  }
  // 행별 수동 배당률
  const setManualYield = (ticker: string, y: number) => {
    setPlan((p) => {
      const others = p.stockYields.filter((yld) => yld.ticker !== ticker)
      return { ...p, stockYields: [...others, { ticker, yield: y, manual: true }] }
    })
    setDirty(true)
  }
  // 프리셋 종목 추가 (티커·배당률·상승률 자동 채움)
  const PRESETS: Record<string, { ticker: string; yield: number; growth: number }[]> = {
    'div-us': [
      { ticker: 'SCHD', yield: 3.5, growth: 9 },
      { ticker: 'VYM',  yield: 2.8, growth: 8 },
      { ticker: 'JEPI', yield: 7.5, growth: 5 },
    ],
    'div-kr': [
      { ticker: '005930.KS', yield: 2.5, growth: 7 },   // 삼성전자
      { ticker: '105560.KS', yield: 5.0, growth: 6 },   // KB금융
      { ticker: '033780.KS', yield: 6.0, growth: 4 },   // SK텔레콤
    ],
    growth: [
      { ticker: 'QQQ',  yield: 0.5, growth: 13 },
      { ticker: 'AAPL', yield: 0.5, growth: 14 },
      { ticker: 'MSFT', yield: 0.7, growth: 12 },
      { ticker: 'NVDA', yield: 0.03, growth: 25 },
    ],
    mixed: [
      { ticker: 'SCHD',  yield: 3.5, growth: 9 },
      { ticker: 'AAPL',  yield: 0.5, growth: 14 },
      { ticker: '005930.KS', yield: 2.5, growth: 7 },
      { ticker: 'JEPI',  yield: 7.5, growth: 5 },
    ],
  }
  const addPreset = (key: string) => {
    const stocks = PRESETS[key] ?? []
    setPlan((p) => {
      const existing = new Set(p.stockHoldings.map((h) => h.ticker))
      const toAdd = stocks.filter((s) => !existing.has(s.ticker))
      const newHoldings = [...p.stockHoldings, ...toAdd.map((s) => ({ ticker: s.ticker, weight: 1, growthRate: s.growth }))]
      const newYields = [...p.stockYields]
      for (const s of toAdd) {
        if (!newYields.some((y) => y.ticker === s.ticker)) {
          newYields.push({ ticker: s.ticker, yield: s.yield, manual: true })
        }
      }
      return { ...p, stockHoldings: newHoldings, stockYields: newYields }
    })
    setDirty(true)
  }
  // 자동산정 — 배당률 + 주가상승률 동시 산정 (/api/yield, 수동 행 보존)
  const fetchYields = async () => {
    const tickers = plan.stockHoldings.map((h) => h.ticker).filter(Boolean)
    if (tickers.length === 0) { setYieldErr('종목을 먼저 입력하세요.'); return }
    setYieldLoading(true); setYieldErr('')
    const manualYieldMap = new Map(plan.stockYields.filter((y) => y.manual).map((y) => [y.ticker, y.yield]))
    // 배당률 + 상승률 동시 fetch
    const fetched: { ticker: string; yield: number; manual: boolean; growth: number | null }[] = await Promise.all(tickers.map(async (t) => {
      const yld = manualYieldMap.get(t) ?? 0
      const isManual = manualYieldMap.has(t)
      try {
        const r = await fetch(`/api/yield?ticker=${encodeURIComponent(t)}`)
        if (!r.ok) return { ticker: t, yield: yld, manual: isManual, growth: null }
        const d = await r.json()
        return { ticker: t, yield: isManual ? yld : (d.avg3yYield ?? 0), manual: isManual, growth: d.avg3yGrowth ?? null }
      } catch {
        return { ticker: t, yield: yld, manual: isManual, growth: null }
      }
    }))
    // stockYields + stockHoldings.growthRate 업데이트
    setPlan((p) => {
      const newYields = fetched.map((f) => ({ ticker: f.ticker, yield: f.yield, manual: f.manual }))
      const newHoldings = p.stockHoldings.map((h) => {
        const f = fetched.find((x) => x.ticker === h.ticker)
        return (f && f.growth != null) ? { ...h, growthRate: f.growth } : h
      })
      return { ...p, stockYields: newYields, stockHoldings: newHoldings }
    })
    setDirty(true)
    setYieldLoading(false)
    const ok = fetched.filter((r) => r.yield > 0).length
    if (ok === 0) setYieldErr(`${tickers.length}개 종목 조회 실패. 수동으로 배당률·상승률을 입력하세요.`)
    else if (ok < tickers.length) setYieldErr(`${tickers.length - ok}개 종목 조회 실패 (수동 입력 필요).`)
  }
  // 종목별 growthRate 가중평균 → stockGrowthRate (자동)
  const blendedGrowth = (() => {
    const holdings = plan.stockHoldings.filter((h) => h.ticker && h.weight > 0 && (h.growthRate ?? 0) > 0)
    const totalW = holdings.reduce((s, h) => s + h.weight, 0)
    if (totalW <= 0) return 0
    return holdings.reduce((s, h) => s + (h.growthRate ?? 0) * (h.weight / totalW), 0)
  })()

  const handleSave = () => saveMut.mutate(plan, { onSuccess: () => setDirty(false) })

  // 부동산 명의 가중 → 1인별 건보 재산분
  const prop = realEstatePropertyBases(realEstateAssets)

  // 국민연금 자산(확정급여) — 월수령액·수령개시연령 추출 (plan.sources에서 national로 분류된 것)
  const nationals = pensionAssets
    .filter((a) => plan.sources.find((s) => s.id === a.id)?.taxType === 'national')
    .map((a) => {
      const d = a.detail as PensionDetail | undefined
      return d ? {
        expectedStartYear: d.expectedStartYear,
        expectedEndYear: d.expectedEndYear,
        expectedMonthlyPayout: d.expectedMonthlyPayout,
        annualGrowthRate: d.annualGrowthRate ?? 0,
      } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // 종목별 growthRate 가중평균 → stockGrowthRate 자동 반영
  const effectivePlan = { ...plan, stockGrowthRate: blendedGrowth }
  const h = computePensionVehiclePerPerson(effectivePlan, {
    husbandProperty: prop.husband,
    wifeProperty: prop.wife,
    nationalPensions: nationals,
  })

  // 연도별 연금 스케줄 (국민연금 65세 step-up 가시)
  const schedule = pensionSchedule(effectivePlan, nationals, effectivePlan.startYear, effectivePlan.startYear + (effectivePlan.withdrawalYears || 1) - 1)

  // 1인별 종합소득공제 자동 산정 표시
  const perPersonDed = computePerPersonComprehensiveDeduction(plan)

  // 건보 소득분/재산분 분해 (지출 섹션 표시용)
  const personHI = (p: typeof h.husband, propBase: { propertyTaxBase: number; rentalDeposit: number }) =>
    calcHealthInsurance({
      pensionAnnual: p.annualPensionTaxable + p.annualPensionExempt,
      dividendAnnual: p.financialIncome,
      otherAnnual: plan.otherIncome,
      propertyTaxBase: propBase.propertyTaxBase,
      rentalDeposit: propBase.rentalDeposit,
      carValue: 0,
      scorePerPoint: 208.4,
    })
  const husbandHI = personHI(h.husband, prop.husband)
  const wifeHI = personHI(h.wife, prop.wife)
  const stockBalance = stockBalanceFromInflows(plan.allocations)
  const yieldPct = stockAccountYield(plan)
  const inflowTotal = totalInflows(plan)
  const irpInflow = plan.allocations.reduce((s, a) => s + a.irpAmount, 0)
  const stockInflow = plan.allocations.reduce((s, a) => s + a.stockAmount, 0)
  // 은퇴계획 목돈수입 (분배 대상, 단일 소스)
  const lumpsums = retirement?.lumpsum ?? []

  const PersonKpi = ({ person, label, color }: { person: typeof h.husband; label: string; color: string }) => {
    const monthlyNet = Math.round(person.netAnnual / 12) - person.healthMonthly
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-300">{label}</p>
          <span className="text-[10px] text-gray-500">건보 {formatManwon(person.healthMonthly)}/월</span>
        </div>
        {/* 월 순소득 강조 */}
        <div className="bg-gray-900/60 rounded-lg p-2.5">
          <p className="text-[10px] text-gray-500">월 순소득 (순취득÷12 − 건보)</p>
          <p className={`text-xl font-bold ${color}`}>{formatManwon(monthlyNet)}<span className="text-xs text-gray-500 font-normal">/월</span></p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <p className="text-gray-500">연금수령</p>
            <p className="text-gray-100 font-semibold">{formatManwon(person.annualPensionTaxable + person.annualPensionExempt)}</p>
            <p className="text-red-400/80 text-[10px]">연금소득세 {formatManwon(person.pensionTax)}</p>
          </div>
          <div>
            <p className="text-gray-500">금융소득</p>
            <p className="text-gray-100 font-semibold">{formatManwon(person.financialIncome)}</p>
            <p className="text-red-400/80 text-[10px]">금융소득세 {formatManwon(person.financialTax)}</p>
          </div>
          <div>
            <p className="text-gray-500">총세금(연)</p>
            <p className="text-red-400 font-semibold">{formatManwon(person.totalAnnualTax)}</p>
            <p className="text-gray-600 text-[10px]">연금 {formatManwon(person.pensionTax)} · 금융 {formatManwon(person.financialTax)}</p>
          </div>
          <div><p className="text-gray-500">순취득(연)</p><p className="text-emerald-400 font-semibold">{formatManwon(person.netAnnual)}</p></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/pension')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-gray-100 truncate">🪙 개인투자시뮬 (가족)</h2>
        </div>
        <button onClick={handleSave} disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 shrink-0">
          <Save className="w-4 h-4" />
          {saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      {/* 면책 */}
      <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-200/90 leading-relaxed">
          남편/와이프 <b>1인별</b> 세금·건보 추정. 금융소득 2천만 한도·연금소득세 각자 적용.
          기존 연금원천(IRP·연금저축)은 남편 명의 가정. 실제는 규정·연도별 변동 → <b>세무사·노무사 확인 필수</b>.
        </p>
      </div>

            {/* ═══ 입력 (사용자가 정하는 것) ═══ */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-gray-200">✏️ 입력</span>
        <span className="text-[11px] text-gray-600">목돈 자금 처리 · 일반주식계좌 · 수령·공제 설정</span>
      </div>

{/* + 목돈 분배 (은퇴계획 목돈수입 → 어디로) */}
      <Expander title="➕ 목돈 분배 (은퇴계획 목돈수입 기준)" badge={`${lumpsums.length}개`} defaultOpen>
        <div className="bg-blue-500/5 border border-blue-700/30 rounded-lg p-3">
          <p className="text-[11px] text-blue-200/90 leading-relaxed">
            은퇴계획의 <b>목돈수입</b>에 입력한 자금을 <b>어디로 넣을지</b> 정합니다.
            <b>일반주식계좌</b>는 항상 넣을 수 있고, <b>퇴직IRP</b>는 <b>퇴직금(위로금)일 때만</b> 선택 가능합니다.
            나누고 남은 금액은 자동으로 <b>현금보유</b>(은퇴계획 목돈 수입)가 됩니다.
          </p>
          <p className="text-[10px] text-blue-200/70 mt-1">목돈 자금 추가·수정은 은퇴계획(/retirement) 목돈수입에서.</p>
        </div>
        {lumpsums.length === 0 && (
          <p className="text-center text-xs text-gray-600 py-4">
            목돈수입이 없습니다. 은퇴계획(/retirement)의 목돈수입에서 먼저 추가하세요.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {lumpsums.map((l) => {
            const alloc = plan.allocations.find((a) => a.lumpsumId === l.id) ?? { irpAmount: 0, stockAmount: 0 }
            return (
              <AllocationCard key={l.id} lumpsum={l} allocation={alloc}
                onChange={(patch) => setAllocation(l.id, patch)} />
            )
          })}
        </div>
        <p className="text-[11px] text-gray-600">
          분배된 투자 원금 — 퇴직IRP {formatManwon(irpInflow)} · 일반주식계좌 {formatManwon(stockInflow)}
        </p>
      </Expander>

{/* 일반주식계좌 포트폴리오 (배당) */}
      <Expander title="📈 일반주식계좌 포트폴리오 (배당)">
        <p className="text-[11px] font-semibold text-gray-300">
          잔액 {formatManwon(stockBalance)} · 수익률 {yieldPct}% · 연배당 {formatManwon(Math.round(stockBalance * yieldPct / 100))}
        </p>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          잔액은 <b>stock 유입 합</b>에서 자동 산출. 티커 입력 후 Enter → 배당률·상승률 자동 산정. 수동 수정 가능.
        </p>
        {/* 명의 */}
        <Row label="계좌 명의">
          <OwnershipPreset value={plan.stockOwnership} onChange={(o) => update('stockOwnership', o)} />
        </Row>
        {/* 종목 리스트 */}
        <div className="grid grid-cols-12 gap-1 text-[9px] text-gray-500 px-1 mb-1">
          <span className="col-span-4">종목</span>
          <span className="col-span-2 text-right">비중</span>
          <span className="col-span-2 text-right">배당%</span>
          <span className="col-span-2 text-right">상승%</span>
          <span className="col-span-2"></span>
        </div>
        <div className="space-y-2">
          {plan.stockHoldings.map((hd, i) => {
            const yld = plan.stockYields.find((y) => y.ticker === hd.ticker && hd.ticker)
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-4">
                  <input type="text" placeholder="종목(SCHD…)"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                    value={hd.ticker}
                    onChange={(e) => updateHolding(i, { ticker: e.target.value.toUpperCase() })}
                    onBlur={(e) => { const t = e.target.value.trim().toUpperCase(); if (t) void autoFetchHolding(t, i) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  />
                  {hd.name && hd.name !== hd.ticker && (
                    <p className="text-[9px] text-gray-500 truncate mt-0.5">{hd.name}</p>
                  )}
                </div>
                <input type="number" placeholder="비중" inputMode="decimal"
                  className="col-span-2 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-100 text-right focus:outline-none focus:border-blue-500"
                  value={hd.weight || ''} onChange={(e) => updateHolding(i, { weight: Number(e.target.value) })} />
                <input type="number" placeholder="배당%" inputMode="decimal"
                  className={cn('col-span-2 bg-gray-700 border rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-blue-500',
                    yld?.manual ? 'border-emerald-600 text-emerald-300' : 'border-gray-600 text-gray-100')}
                  value={yld?.yield ?? ''}
                  onChange={(e) => hd.ticker && setManualYield(hd.ticker, Number(e.target.value))} />
                <input type="number" placeholder="상승%" inputMode="decimal"
                  className="col-span-2 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-cyan-300 text-right focus:outline-none focus:border-cyan-500"
                  value={hd.growthRate ?? ''}
                  onChange={(e) => updateHolding(i, { growthRate: Number(e.target.value) })} />
                <button onClick={() => removeHolding(i)} className="col-span-2 text-gray-600 hover:text-red-400 flex justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={addHolding}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors">
            <Plus className="w-3.5 h-3.5" /> 종목 추가
          </button>
          <span className="text-[11px] text-gray-600">
            가중평균 배당 {yieldPct}% · 상승 {blendedGrowth.toFixed(1)}% → 연 배당 {formatManwon(Math.round(stockBalance * yieldPct / 100))}
          </span>
        </div>
        {/* 프리셋 종목 선택 */}
        <div className="pt-2 border-t border-gray-700/50">
          <p className="text-[10px] text-gray-500 mb-1.5">📦 프리셋 종목 (원클릭 추가)</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => addPreset('div-us')} className="px-2 py-1 text-[10px] rounded-lg bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-300 border border-emerald-700/40 transition-colors">🇺🇸 고배당 (SCHD·VYM·JEPI)</button>
            <button onClick={() => addPreset('div-kr')} className="px-2 py-1 text-[10px] rounded-lg bg-blue-700/30 hover:bg-blue-700/50 text-blue-300 border border-blue-700/40 transition-colors">🇰🇷 고배당 (삼성전자·KB금융·SK텔레콤)</button>
            <button onClick={() => addPreset('growth')} className="px-2 py-1 text-[10px] rounded-lg bg-purple-700/30 hover:bg-purple-700/50 text-purple-300 border border-purple-700/40 transition-colors">📈 IT대형주 (QQQ·AAPL·MSFT·NVDA)</button>
            <button onClick={() => addPreset('mixed')} className="px-2 py-1 text-[10px] rounded-lg bg-orange-700/30 hover:bg-orange-700/50 text-orange-300 border border-orange-700/40 transition-colors">🎯 배당+성장 혼합</button>
          </div>
        </div>
        {yieldErr && <p className="text-[11px] text-orange-400/80">{yieldErr}</p>}
        {plan.stockHoldings.length === 0 && (
          <Row label="수동 배당률(종목 없을 때)" hint="종목 입력이 귀찮을 때"><NumInput value={plan.stockManualYield ?? 0} onChange={(v) => update('stockManualYield', v)} suffix="%" /></Row>
        )}
      </Expander>

      {/* ═══ 결과 (자동 계산) ═══ */}
      {/* ═══ 개요 (한눈에 보기) ═══ */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-emerald-400">개요</span>
        <span className="text-[11px] text-gray-600">투자 원금 · 기준년도 수입·지출 (가족 합산)</span>
      </div>

{/* 투자 원금 요약 (유입이 만든 원금) */}
      {(() => {
        const irpHusband = plan.sources.filter(s => (s.taxType==='irp'||s.taxType==='taxable') && s.owner==='husband').reduce((s,x)=>s+x.principal,0) + irpInflow
        const irpWife = plan.sources.filter(s => (s.taxType==='irp'||s.taxType==='taxable') && s.owner==='wife').reduce((s,x)=>s+x.principal,0)
        const PrincipalCard = ({ title, husband, wife, note }: { title: string; husband: number; wife: number; note?: string }) => (
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-1">{title}</p>
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              <div><p className="text-[10px] text-blue-400">남편</p><p className="text-gray-100 font-semibold">{formatManwon(husband)}</p></div>
              <div><p className="text-[10px] text-pink-400">와이프</p><p className="text-gray-100 font-semibold">{formatManwon(wife)}</p></div>
              <div><p className="text-[10px] text-gray-400">합산(가족)</p><p className="text-emerald-400 font-semibold">{formatManwon(husband + wife)}</p></div>
            </div>
            {note && <p className="text-[10px] text-gray-600 mt-1">{note}</p>}
          </div>
        )
        return (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4">
            <p className="text-xs font-semibold text-gray-300 mb-2">💼 투자 원금 요약 (남편/와이프)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <PrincipalCard title="IRP 원금" husband={irpHusband} wife={irpWife}
                note={`기존 연금 + IRP 유입 ${formatManwon(irpInflow)} · 연금은 남편 명의 가정`} />
              <PrincipalCard title="일반주식계좌 원금" husband={h.husband.stockBalance} wife={h.wife.stockBalance}
                note={`stock 유입 × ${yieldPct}% = 연배당 ${formatManwon(Math.round((h.husband.stockBalance + h.wife.stockBalance) * yieldPct / 100))}`} />
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">
              💡 분배하지 않은 나머지는 현금 수령(은퇴계획 목돈)으로, 투자 원금에서 제외됨.
            </p>
          </div>
        )
      })()}

      {/* 기준년도 수입·지출 스냅샷 (가족 합산) */}
      <div className="bg-gray-800 border border-emerald-700/40 rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-300">📅 기준년도 수입·지출 (가족 합산)</p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">기준년도</span>
            <input type="number" inputMode="decimal"
              className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
              value={plan.refYear} onChange={(e) => update('refYear', Number(e.target.value))} />
            <span className="text-[11px] text-gray-500">년</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">연금수령액(연)</p>
            <p className="text-gray-100 font-semibold">{formatManwon(h.totals.grossAnnual - (h.totals.financialIncome))}</p>
            <p className="text-[10px] text-gray-600">{formatManwon(Math.round((h.totals.grossAnnual - h.totals.financialIncome) / 12))}/월</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">배당금(연)</p>
            <p className="text-emerald-400 font-semibold">{formatManwon(h.totals.financialIncome)}</p>
            <p className="text-[10px] text-gray-600">{formatManwon(Math.round(h.totals.financialIncome / 12))}/월</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">지출 — 세금(연)+걸보(월)</p>
            <p className="text-red-400 font-semibold">{formatManwon(h.totals.totalAnnualTax)} + {formatManwon(h.totals.healthMonthly)}/월</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">순소득(월)</p>
            <p className="text-emerald-400 font-semibold">{formatManwon(Math.round(h.totals.netAnnual / 12) - h.totals.healthMonthly)}/월</p>
          </div>
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5">
          {plan.refYear}년 기준. 국민연금 개시(65세) 전후에 따라 연금수령액이 달라집니다. 세금 = 연금소득세 + 금융소득세, 걸보 = 지역걸보(월).
        </p>
      </div>

      {/* ═══ 수입 상세 ═══ */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-emerald-400">수입 상세</span>
        <span className="text-[11px] text-gray-600">연금수입 + 배당수입</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 연금수입 */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4">
          <p className="text-xs font-semibold text-gray-300 mb-2">🛡️ 연금수입 (연)</p>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between"><span className="text-gray-500">과세 연금 (IRP·연금저축)</span><span className="text-gray-100 font-semibold">{formatManwon(h.husband.annualPensionTaxable)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">비과세 연금 (98년)</span><span className="text-gray-100 font-semibold">{formatManwon(h.husband.annualPensionExempt)}</span></div>
            <div className="flex justify-between"><span className="text-blue-400">국민연금 ({plan.refYear}년)</span><span className="text-blue-300 font-semibold">{formatManwon(Math.round((schedule.find((r) => r.nationalAnnual > 0)?.nationalAnnual ?? 0)))}</span></div>
            <div className="flex justify-between border-t border-gray-700 pt-1.5"><span className="text-gray-400 font-semibold">연금수입 합계</span><span className="text-emerald-400 font-bold">{formatManwon(h.husband.annualPensionTaxable + h.husband.annualPensionExempt)}</span></div>
            <p className="text-[10px] text-gray-600">{formatManwon(Math.round((h.husband.annualPensionTaxable + h.husband.annualPensionExempt) / 12))}/월 · 과세연금 = 원금÷{plan.withdrawalYears}년 균등 인출 · 국민연금 = 65세부터 월 {formatManwon(Math.round((schedule.find((r) => r.nationalAnnual > 0)?.nationalAnnual ?? 0) / 12))}</p>
          </div>
        </div>
        {/* 배당수입 */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4">
          <p className="text-xs font-semibold text-gray-300 mb-2">📈 배당수입 (연)</p>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between"><span className="text-gray-500">일반주식계좌 배당</span><span className="text-emerald-400 font-semibold">{formatManwon(h.totals.financialIncome)}</span></div>
            <div className="flex justify-between"><span className="text-[10px] text-gray-600">— 남편</span><span className="text-gray-300">{formatManwon(h.husband.financialIncome)}</span></div>
            <div className="flex justify-between"><span className="text-[10px] text-gray-600">— 와이프</span><span className="text-gray-300">{formatManwon(h.wife.financialIncome)}</span></div>
            <p className="text-[10px] text-gray-600">잔액 {formatManwon(stockBalance)} × {yieldPct}% = 연 {formatManwon(Math.round(stockBalance * yieldPct / 100))} · {formatManwon(Math.round(h.totals.financialIncome / 12))}/월</p>
            <p className="text-[10px] text-gray-600 mt-1 pt-1 border-t border-gray-700/50">※ 연금저축의 배당수입은 <b>배당재투자</b>로 들어가 별도 수입으로 잡지 않습니다.</p>
          </div>
        </div>
      </div>

      {/* ═══ 지출 상세 ═══ */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-red-400">지출 상세</span>
        <span className="text-[11px] text-gray-600">세금 + 건보료 (1인별)</span>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-2 px-3 font-medium whitespace-nowrap"></th>
              <th className="text-right py-2 px-3 font-medium">💸 세금 (연 / 월)</th>
              <th className="text-right py-2 px-3 font-medium">🏥 건보료 (월)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-700/50">
              <td className="py-2 px-3 text-blue-400 font-medium whitespace-nowrap">🧑 남편</td>
              <td className="py-2 px-3 text-right">
                <span className="text-red-400 font-semibold">{formatManwon(h.husband.totalAnnualTax)}</span>
                <span className="text-gray-600 ml-1">({formatManwon(Math.round(h.husband.totalAnnualTax / 12))})</span>
                <p className="text-[10px] text-gray-600">연금 {formatManwon(h.husband.pensionTax)} · 금융 {formatManwon(h.husband.financialTax)}</p>
              </td>
              <td className="py-2 px-3 text-right">
                <span className="text-gray-100 font-semibold">{formatManwon(husbandHI.grandTotal)}</span>
                <p className="text-[10px] text-gray-600">소득분 {formatManwon(husbandHI.incomeMonthly)} · 재산분 {formatManwon(husbandHI.propertyMonthly)}</p>
              </td>
            </tr>
            <tr className="border-b border-gray-700/50">
              <td className="py-2 px-3 text-pink-400 font-medium whitespace-nowrap">👩 와이프</td>
              <td className="py-2 px-3 text-right">
                <span className="text-red-400 font-semibold">{formatManwon(h.wife.totalAnnualTax)}</span>
                <span className="text-gray-600 ml-1">({formatManwon(Math.round(h.wife.totalAnnualTax / 12))})</span>
                <p className="text-[10px] text-gray-600">연금 {formatManwon(h.wife.pensionTax)} · 금융 {formatManwon(h.wife.financialTax)}</p>
              </td>
              <td className="py-2 px-3 text-right">
                <span className="text-gray-100 font-semibold">{formatManwon(wifeHI.grandTotal)}</span>
                <p className="text-[10px] text-gray-600">소득분 {formatManwon(wifeHI.incomeMonthly)} · 재산분 {formatManwon(wifeHI.propertyMonthly)}</p>
              </td>
            </tr>
            <tr className="bg-gray-900/40">
              <td className="py-2 px-3 text-gray-300 font-semibold whitespace-nowrap">🏠 가족</td>
              <td className="py-2 px-3 text-right">
                <span className="text-red-400 font-bold">{formatManwon(h.totals.totalAnnualTax)}</span>
                <span className="text-gray-600 ml-1">({formatManwon(Math.round(h.totals.totalAnnualTax / 12))})</span>
              </td>
              <td className="py-2 px-3 text-right">
                <span className="text-gray-100 font-bold">{formatManwon(h.totals.healthMonthly)}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-[10px] text-gray-600 px-3 py-2 border-t border-gray-700">
          세금 = 연금소득세 + 금융소득세. 건보 = 소득분 + 재산분(부동산 명의 지분 반영) + 장기요양. {plan.refYear}년 기준.
        </p>
      </div>
    </div>
  )
}
