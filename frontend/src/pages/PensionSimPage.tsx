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
function AllocationCard({ lumpsum, allocation, onChange }: {
  lumpsum: { id: string; name: string; amount: number; receiveYear: number; taxKind?: string }
  allocation: { irpAmount: number; stockAmount: number }
  onChange: (patch: Partial<{ irpAmount: number; stockAmount: number }>) => void
}) {
  const cash = Math.max(0, lumpsum.amount - allocation.irpAmount - allocation.stockAmount)
  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-200 font-medium truncate">{lumpsum.name || '목돈'}</span>
        <span className="text-sm text-gray-100 font-semibold shrink-0">{formatManwon(lumpsum.amount)}</span>
      </div>
      <p className="text-[10px] text-gray-600">{lumpsum.receiveYear}년 일회 수령{lumpsum.taxKind === 'severance' ? ' · 퇴직소득세 적용(현금분)' : ''}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">→ 퇴직IRP (연금으로 굴림)</p>
          <AmountInput value={allocation.irpAmount} onChange={(v) => onChange({ irpAmount: v })} />
        </div>
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">→ 일반주식계좌 (배당)</p>
          <AmountInput value={allocation.stockAmount} onChange={(v) => onChange({ stockAmount: v })} />
        </div>
      </div>
      <p className="text-[11px] text-gray-500">
        나머지(현금 수령) <span className="text-gray-300 font-semibold">{formatManwon(cash)}</span>
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
  const realEstateAssets = useAssetsByType('REAL_ESTATE')
  const { data: retirement } = useRetirement()

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
        detail: { pensionType: (a.detail as { pensionType?: string })?.pensionType },
      })),
      base.sources,
    )
    const manual = base.sources.filter((s) => !pensionAssets.find((a) => a.id === s.id))
    setPlan({
      ...EMPTY_PENSION_PLAN, ...base,
      sources: [...auto, ...manual],
      allocations: base.allocations ?? [],
      stockHoldings: base.stockHoldings ?? [],
      stockYields: base.stockYields ?? [],
      stockOwnership: base.stockOwnership ?? { husband: 50, wife: 50 },
    })
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
  const updateHolding = (idx: number, patch: Partial<{ ticker: string; weight: number }>) => {
    setPlan((p) => ({ ...p, stockHoldings: p.stockHoldings.map((h, i) => i === idx ? { ...h, ...patch } : h) }))
    setDirty(true)
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
  // /api/yield 자동산정 (수동 행 보존)
  const fetchYields = async () => {
    const tickers = plan.stockHoldings.map((h) => h.ticker).filter(Boolean)
    if (tickers.length === 0) { setYieldErr('종목을 먼저 입력하세요.'); return }
    setYieldLoading(true); setYieldErr('')
    const manualMap = new Map(plan.stockYields.filter((y) => y.manual).map((y) => [y.ticker, y.yield]))
    const results = await Promise.all(tickers.map(async (t) => {
      try {
        const r = await fetch(`/api/yield?ticker=${encodeURIComponent(t)}`)
        if (!r.ok) return { ticker: t, yield: manualMap.get(t) ?? 0, manual: manualMap.has(t) }
        const d = await r.json()
        return { ticker: t, yield: d.avg3yYield ?? 0, manual: false }
      } catch {
        return { ticker: t, yield: manualMap.get(t) ?? 0, manual: manualMap.has(t) }
      }
    }))
    setPlan((p) => ({ ...p, stockYields: results }))
    setDirty(true)
    setYieldLoading(false)
    const ok = results.filter((r) => r.yield > 0).length
    if (ok === 0) setYieldErr(`${tickers.length}개 종목 조회 실패. 수동으로 배당률을 입력하세요.`)
    else if (ok < tickers.length) setYieldErr(`${tickers.length - ok}개 종목 조회 실패 (수동 입력 필요).`)
  }

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

  const h = computePensionVehiclePerPerson(plan, {
    husbandProperty: prop.husband,
    wifeProperty: prop.wife,
    nationalPensions: nationals,
  })

  // 연도별 연금 스케줄 (국민연금 65세 step-up 가시)
  const schedule = pensionSchedule(plan, nationals, plan.startYear, plan.startYear + (plan.withdrawalYears || 1) - 1)

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
          <h2 className="text-lg sm:text-xl font-bold text-gray-100 truncate">🪙 개인 투자 시뮬 (1인별)</h2>
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
            은퇴계획의 <b>목돈수입</b>에 입력한 자금(퇴직위로금·전세보증금 등)을 <b>어디로 넣을지</b> 정합니다.
            목돈 금액을 <b>퇴직IRP / 일반주식계좌</b>로 나누고, <b>남은 것은 현금 수령</b>(은퇴계획 목돈 수입)이 됩니다.
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
          잔액은 <b>stock 유입 합</b>에서 자동 산출(별도 입력 없음). 종목과 비중을 입력해 배당률을 자동 산정하거나 행별로 수동 입력.
        </p>
        {/* 명의 */}
        <Row label="계좌 명의">
          <OwnershipPreset value={plan.stockOwnership} onChange={(o) => update('stockOwnership', o)} />
        </Row>
        {/* 종목 리스트 */}
        <div className="space-y-2">
          {plan.stockHoldings.map((hd, i) => {
            const yld = plan.stockYields.find((y) => y.ticker === hd.ticker && hd.ticker)
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input type="text" placeholder="종목(SCHD…)"
                  className="col-span-5 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
                  value={hd.ticker} onChange={(e) => updateHolding(i, { ticker: e.target.value.toUpperCase() })} />
                <input type="number" placeholder="비중" inputMode="decimal"
                  className="col-span-3 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-100 text-right focus:outline-none focus:border-blue-500"
                  value={hd.weight || ''} onChange={(e) => updateHolding(i, { weight: Number(e.target.value) })} />
                <input type="number" placeholder="배당률" inputMode="decimal"
                  className={cn('col-span-3 bg-gray-700 border rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-blue-500',
                    yld?.manual ? 'border-emerald-600 text-emerald-300' : 'border-gray-600 text-gray-100')}
                  value={yld?.yield ?? ''}
                  onChange={(e) => hd.ticker && setManualYield(hd.ticker, Number(e.target.value))} />
                <button onClick={() => removeHolding(i)} className="col-span-1 text-gray-600 hover:text-red-400 flex justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={addHolding}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors">
            <Plus className="w-3.5 h-3.5" /> 종목 추가
          </button>
          <button onClick={fetchYields} disabled={yieldLoading}
            className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40">
            {yieldLoading ? '조회 중…' : '배당률 자동 산정'}
          </button>
          <span className="text-[11px] text-gray-600">
            가중평균 {yieldPct}% → 연 배당 {formatManwon(Math.round(stockBalance * yieldPct / 100))}
          </span>
        </div>
        {yieldErr && <p className="text-[11px] text-orange-400/80">{yieldErr}</p>}
        {plan.stockHoldings.length === 0 && (
          <Row label="수동 배당률(종목 없을 때)" hint="종목 입력이 귀찮을 때"><NumInput value={plan.stockManualYield ?? 0} onChange={(v) => update('stockManualYield', v)} suffix="%" /></Row>
        )}
      </Expander>

{/* 수령 · 세금 설정 */}
      <Expander title="⚙️ 수령 · 세금 설정">
        <Row label="수령 개시 연도"><NumInput value={plan.startYear} onChange={(v) => update('startYear', v)} /></Row>
        <Row label="수령 기간(연)"><NumInput value={plan.withdrawalYears} onChange={(v) => update('withdrawalYears', v)} suffix="년" /></Row>
        <Row label="기타 종합소득(연)" hint="남편 근로/사업 — 와이프 분은 추후"><AmountInput value={plan.otherIncome} onChange={(v) => update('otherIncome', v)} /></Row>
        <p className="text-[11px] text-gray-600">연금소득공제 1,200만원은 법정 고정액으로 자동 적용됩니다.</p>
        <div className="py-1">
          <p className="text-sm text-gray-400 mb-1">종합소득공제 (1인별 자동)</p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={plan.spouseDependent} onChange={(e) => update('spouseDependent', e.target.checked)} className="accent-blue-500" />
              배우자 부양 (부부 가정 시 ON)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={plan.useStandardDeduction} onChange={(e) => update('useStandardDeduction', e.target.checked)} className="accent-blue-500" />
              표준공제 100만 사용 (특별공제 없을 때)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              부양가족 수
              <button type="button" onClick={() => update('dependents', Math.max(0, plan.dependents - 1))} className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded text-gray-200">−</button>
              <span className="w-6 text-center text-gray-100">{plan.dependents}</span>
              <button type="button" onClick={() => update('dependents', Math.min(5, plan.dependents + 1))} className="w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded text-gray-200">+</button>
              <span className="text-[10px] text-gray-600">(1인당 150만)</span>
            </label>
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5 sm:text-right sm:mr-44">
            1인별 공제 = 본인 150만 + (배우자·부양가족·표준) ÷ 2 = <span className="text-blue-400 font-semibold">{formatManwon(perPersonDed.husband)}</span>
          </p>
        </div>
      </Expander>

      {/* ═══ 결과 (자동 계산) ═══ */}
{/* 📥 수입 (들어오는 것) */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-emerald-400">📥 수입 (들어오는 것)</span>
        <span className="text-[11px] text-gray-600">연금 수령 · 일반주식계좌 배당 · 유입 항목</span>
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

      {/* 연금 수령 요약 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-gray-300">🛡️ 연금 수령 (가족 합산 · 남편 기준)</p>
          <span className="text-[10px] text-gray-500">국민연금 65세 개시 시 상승 · 최대 수령 {formatManwon(Math.round((h.husband.annualPensionTaxable + h.husband.annualPensionExempt)/12))}/월</span>
        </div>
        <p className="text-[10px] text-gray-600 mb-1">연금은 현재 남편 명의만 모델링 (와이프 본인 연금은 미반영 → 가족 합산 = 남편 합계와 동일)</p>
        {/* 연도별 연금 스케줄 (국민연금 step-up) */}
        {schedule.length > 0 && (
          <div className="overflow-x-auto -mx-1 mt-1">
            <table className="w-full text-[10px] text-right">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="py-1 px-1 text-left font-medium">연도</th>
                  <th className="py-1 px-1 font-medium">IRP·연금저축/월</th>
                  <th className="py-1 px-1 font-medium">국민연금/월</th>
                  <th className="py-1 px-1 font-medium">합계/월</th>
                </tr>
              </thead>
              <tbody>
                {schedule.filter((_, i) => i % 3 === 0).map((r) => (
                  <tr key={r.year} className={`border-b border-gray-800/50 ${r.nationalAnnual > 0 ? 'bg-blue-500/5' : ''}`}>
                    <td className="py-1 px-1 text-left text-gray-400">{r.year}</td>
                    <td className="py-1 px-1 text-gray-300">{formatManwon(Math.round(r.drawdownAnnual / 12))}</td>
                    <td className="py-1 px-1 text-blue-300">{r.nationalAnnual > 0 ? formatManwon(Math.round(r.nationalAnnual / 12)) : '—'}</td>
                    <td className="py-1 px-1 text-gray-100 font-semibold">{formatManwon(Math.round(r.totalAnnual / 12))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-600 mt-1.5">
          IRP·퇴직·연금저축 = 원금÷{plan.withdrawalYears}년 균등 인출. 국민연금 = 자산에 입력한 월 수령액({formatManwon(Math.round((schedule.find((r) => r.nationalAnnual > 0)?.nationalAnnual ?? 0) / 12)) || 0})을 65세부터 지급.
        </p>
      </div>

{/* 📤 지출 (나가는 것) */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-red-400">📤 지출 (나가는 것)</span>
        <span className="text-[11px] text-gray-600">세금 (연/월) · 건보 (월, 1인별)</span>
      </div>

      <Expander title="💸 세금 · 🏥 건보 (1인별)" defaultOpen>
        {/* 세금 */}
        <div>
          <p className="text-xs font-semibold text-gray-300 mb-1.5">💸 세금</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            {([
              ['🧑 남편', h.husband],
              ['👩 와이프', h.wife],
              ['🏠 가구', { pensionTax: h.totals.pensionTax, financialTax: h.totals.financialTax, totalAnnualTax: h.totals.totalAnnualTax }],
            ] as const).map(([lbl, p]) => (
              <div key={lbl} className="bg-gray-900/50 rounded-lg p-2.5">
                <p className="text-gray-500 mb-1">{lbl}</p>
                <p className="text-gray-300">연금소득세 <span className="text-red-400">{formatManwon(p.pensionTax)}</span> <span className="text-gray-600">({formatManwon(Math.round(p.pensionTax/12))}/월)</span></p>
                <p className="text-gray-300">금융소득세 <span className="text-red-400">{formatManwon(p.financialTax)}</span> <span className="text-gray-600">({formatManwon(Math.round(p.financialTax/12))}/월)</span></p>
                <p className="text-gray-300 mt-0.5">총세금 <span className="text-red-400 font-semibold">{formatManwon(p.totalAnnualTax)}</span> <span className="text-gray-600">({formatManwon(Math.round(p.totalAnnualTax/12))}/월)</span></p>
              </div>
            ))}
          </div>
        </div>
        {/* 건보 */}
        <div className="pt-2">
          <p className="text-xs font-semibold text-gray-300 mb-1.5">🏥 건강보험료 (월, 지역가입자 — 소득분+재산분)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            {([
              ['🧑 남편', husbandHI, prop.husband.propertyTaxBase],
              ['👩 와이프', wifeHI, prop.wife.propertyTaxBase],
            ] as const).map(([lbl, hi, propBase]) => (
              <div key={lbl} className="bg-gray-900/50 rounded-lg p-2.5">
                <p className="text-gray-500 mb-1">{lbl}</p>
                <p className="text-gray-100 font-semibold">{formatManwon(hi.grandTotal)}<span className="text-gray-500 font-normal">/월</span></p>
                <p className="text-gray-600">소득분 {formatManwon(hi.incomeMonthly)} · 재산분 {formatManwon(hi.propertyMonthly)}{hi.carMonthly > 0 ? ` · 차량 ${formatManwon(hi.carMonthly)}` : ''}</p>
                <p className="text-gray-600">부동산 재산과세표준 {formatManwon(propBase)}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-600 mt-1.5">
            재산분은 부동산 명의 지분 반영 (자산 페이지 부동산 명의에서 설정). 장기요양포함.
          </p>
        </div>
      </Expander>

      {/* 💰 남는 것 (월 순소득) — 은퇴계획에서 최종 확인 */}
{/* 1인별 결과 KPI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3">
        <PersonKpi person={h.husband} label="🧑 남편" color="text-blue-400" />
        <PersonKpi person={h.wife} label="👩 와이프" color="text-pink-400" />
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-300">🏠 가구 합계</p>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div><p className="text-gray-500">총수입</p><p className="text-gray-100 font-semibold">{formatManwon(h.totals.grossAnnual)}</p></div>
            <div><p className="text-gray-500">총세금</p><p className="text-red-400 font-semibold">{formatManwon(h.totals.totalAnnualTax)}</p></div>
            <div><p className="text-gray-500">순취득</p><p className="text-emerald-400 font-semibold">{formatManwon(h.totals.netAnnual)}</p></div>
            <div><p className="text-gray-500">건보(월)</p><p className="text-gray-100 font-semibold">{formatManwon(h.totals.healthMonthly)}</p></div>
          </div>
        </div>
      </div>
    </div>
  )
}
