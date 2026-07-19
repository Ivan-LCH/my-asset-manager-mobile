// 연금 시뮬레이션 — 법인시뮬과 대칭되는 "연금·개인 vehicle" 모델. 1인(남편/와이프) 과세.
// 일반주식계좌 잔액 = stock 유입 합, 종목 기반 배당률(자동+수동폴백), 명의 프리셋.
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ChevronDown, AlertTriangle, Trash2, ArrowLeft, Plus } from 'lucide-react'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import { useAssetsByType } from '@/hooks/useAssets'
import {
  EMPTY_PENSION_PLAN, computePensionVehiclePerPerson, stockBalanceFromInflows,
  stockAccountYield, totalInflows, sourcesFromAssets, FINANCIAL_INCOME_LIMIT,
} from '@/lib/pensionSim'
import { blendedYield } from '@/lib/corpSim'
import { formatManwon, cn } from '@/lib/utils'
import {
  type PensionSimPlan, type PensionInflowItem, type Ownership, type OwnershipPreset,
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

// ── 유입 항목 카드 ──────────────────────────────────────────
function InflowCard({ item, onChange, onRemove }: {
  item: PensionInflowItem
  onChange: (patch: Partial<PensionInflowItem>) => void
  onRemove: () => void
}) {
  const isIrp = item.destination === 'irp'
  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input type="text" placeholder="항목명 (예: 희망퇴직위로금)"
          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
        <button onClick={onRemove} className="text-gray-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <AmountInput value={item.amount} onChange={(v) => onChange({ amount: v })} />
      <div>
        <p className="text-[10px] text-gray-500 mb-1">{item.type === 'annual' ? '시작 연도' : '발생 연도'}</p>
        <NumInput value={item.year} onChange={(v) => onChange({ year: v })} suffix="년" />
      </div>
      <div>
        <p className="text-[10px] text-gray-500 mb-1">유형</p>
        <div className="flex gap-1">
          {([['lumpsum', '일회성'], ['annual', '연간반복']] as const).map(([v, label]) => (
            <button key={v} onClick={() => onChange({ type: v })}
              className={cn('flex-1 px-2 py-1 text-[11px] rounded transition-colors',
                item.type === v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-gray-500 mb-1">목적지</p>
        <div className="flex gap-1">
          {([['irp', '퇴직IRP'], ['stock', '일반주식계좌']] as const).map(([v, label]) => (
            <button key={v} onClick={() => onChange({ destination: v, ...(v === 'irp' ? { ownership: { husband: 100, wife: 0 } } : {}) })}
              className={cn('flex-1 px-2 py-1 text-[11px] rounded transition-colors',
                item.destination === v ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
              {label}
            </button>
          ))}
        </div>
        {isIrp && <p className="text-[10px] text-gray-600 mt-1">IRP/퇴직은 남편 명의 가정 (와이프 연금은 추후 지원)</p>}
        {!isIrp && <p className="text-[10px] text-gray-600 mt-1">주식계좌 명의는 아래 '일반주식계좌 포트폴리오'에서 설정</p>}
      </div>
    </div>
  )
}

// ── 메인 ───────────────────────────────────────────────────
export default function PensionSimPage() {
  const navigate = useNavigate()
  const { data: saved } = usePensionSim()
  const saveMut = useSavePensionSim()
  const pensionAssets = useAssetsByType('PENSION')

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
    // 구버전 방어: inflows.ownership / sources.owner 누락 보정
    const startY = base.startYear ?? EMPTY_PENSION_PLAN.startYear
    const inflows = (base.inflows ?? []).map((i) => ({
      ...i, year: i.year ?? startY,
      ownership: i.ownership ?? (i.destination === 'irp' ? { husband: 100, wife: 0 } : { husband: 50, wife: 50 }),
    }))
    setPlan({
      ...EMPTY_PENSION_PLAN, ...base,
      sources: [...auto, ...manual],
      inflows,
      stockHoldings: base.stockHoldings ?? [],
      stockYields: base.stockYields ?? [],
      stockOwnership: base.stockOwnership ?? { husband: 50, wife: 50 },
    })
  }, [saved, pensionAssets])

  const update = useCallback(<K extends keyof PensionSimPlan>(key: K, val: PensionSimPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])

  const updateInflow = (id: string, patch: Partial<PensionInflowItem>) => {
    setPlan((p) => ({ ...p, inflows: p.inflows.map((i) => i.id === id ? { ...i, ...patch } : i) }))
    setDirty(true)
  }
  const addInflow = () => {
    setPlan((p) => ({ ...p, inflows: [...p.inflows, { id: uid(), name: '', amount: 0, type: 'lumpsum', destination: 'irp', year: p.startYear, ownership: { husband: 100, wife: 0 } }] }))
    setDirty(true)
  }
  const removeInflow = (id: string) => {
    setPlan((p) => ({ ...p, inflows: p.inflows.filter((i) => i.id !== id) }))
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

  const h = computePensionVehiclePerPerson(plan)
  const stockBalance = stockBalanceFromInflows(plan.inflows)
  const yieldPct = stockAccountYield(plan)
  const inflowTotal = totalInflows(plan)
  const irpInflow = plan.inflows.filter((i) => i.destination === 'irp').reduce((s, i) => s + i.amount, 0)
  const stockInflow = plan.inflows.filter((i) => i.destination === 'stock').reduce((s, i) => s + i.amount, 0)

  const PersonKpi = ({ person, label, color }: { person: typeof h.husband; label: string; color: string }) => (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-300">{label}</p>
        <span className={`text-[11px] ${color}`}>건보 {formatManwon(person.healthMonthly)}/월</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div><p className="text-gray-500">연금수령</p><p className="text-gray-100 font-semibold">{formatManwon(person.annualPensionTaxable + person.annualPensionExempt)}</p></div>
        <div><p className="text-gray-500">연금소득세</p><p className="text-red-400 font-semibold">{formatManwon(person.pensionTax)}</p></div>
        <div><p className="text-gray-500">금융소득</p><p className="text-gray-100 font-semibold">{formatManwon(person.financialIncome)}</p></div>
        <div><p className="text-gray-500">금융소득세</p><p className="text-red-400 font-semibold">{formatManwon(person.financialTax)}</p></div>
        <div><p className="text-gray-500">총세금</p><p className="text-red-400 font-semibold">{formatManwon(person.totalAnnualTax)}</p></div>
        <div><p className="text-gray-500">순취득</p><p className="text-emerald-400 font-semibold">{formatManwon(person.netAnnual)}</p></div>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/pension')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-gray-100 truncate">🪙 연금·개인 vehicle 시뮬 (1인별)</h2>
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

      {/* + 유입 항목 */}
      <Expander title="➕ 유입 항목 (목적지·명의 선택)" badge={`${plan.inflows.length}개 · ${formatManwon(inflowTotal)}`} defaultOpen>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          추가 자금을 어디로·누구 명의로 굴릴지 선택. <b>퇴직IRP</b> → 연금원금(남편), <b>일반주식계좌</b> → 배당(명의별 금융소득, 각자 2천만 한도).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {plan.inflows.map((it) => (
            <InflowCard key={it.id} item={it}
              onChange={(patch) => updateInflow(it.id, patch)}
              onRemove={() => removeInflow(it.id)} />
          ))}
        </div>
        {plan.inflows.length === 0 && (
          <p className="text-center text-xs text-gray-600 py-4">항목이 없습니다. 아래에서 추가하세요.</p>
        )}
        <button onClick={addInflow}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors">
          <Plus className="w-3.5 h-3.5" /> 항목 추가
        </button>
        {(irpInflow > 0 || stockInflow > 0) && (
          <p className="text-[11px] text-gray-600">
            퇴직IRP 유입 {formatManwon(irpInflow)} · 일반주식계좌 유입 {formatManwon(stockInflow)}
          </p>
        )}
      </Expander>

      {/* 일반주식계좌 포트폴리오 */}
      <Expander title="📈 일반주식계좌 포트폴리오"
        badge={`잔액 ${formatManwon(stockBalance)} · 수익률 ${yieldPct}%`}>
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
        <Row label="연금소득공제"><AmountInput value={plan.pensionDeduction} onChange={(v) => update('pensionDeduction', v)} /></Row>
        <Row label="종합소득공제" hint="본인 150만 + 부양가족 (1인별 적용)"><AmountInput value={plan.comprehensiveDeduction} onChange={(v) => update('comprehensiveDeduction', v)} /></Row>
      </Expander>
    </div>
  )
}
