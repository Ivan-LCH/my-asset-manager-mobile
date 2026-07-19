// 연금 시뮬레이션 — 법인시뮬과 대칭되는 "연금·개인 vehicle" 모델.
// 기존 연금원천은 그대로 가정하고, + 유입 항목의 목적지(퇴직IRP/일반주식계좌)에 따른
// 연간 세금·건보·순취득을 산출. (법인 비교·연도별 현금흐름은 별도 화면·은퇴계획)
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ChevronDown, AlertTriangle, Trash2, ArrowLeft, Plus } from 'lucide-react'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import { useAssetsByType } from '@/hooks/useAssets'
import {
  EMPTY_PENSION_PLAN, computePensionVehicle, totalInflows, sourcesFromAssets,
  FINANCIAL_INCOME_LIMIT,
} from '@/lib/pensionSim'
import { formatManwon, cn } from '@/lib/utils'
import type { PensionSimPlan, PensionInflowItem } from '@/types'

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
      {hint && <p className="text-[11px] text-gray-600 mt-0.5 sm:text-right sm:mr-44">{hint}</p>}
    </div>
  )
}

function Kpi({ label, value, sub, color = 'text-gray-100' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4">
      <p className="text-[11px] sm:text-xs text-gray-500 mb-1 truncate">{label}</p>
      <p className={`text-[13px] sm:text-lg font-bold ${color} break-words`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── 유입 항목 카드 ──────────────────────────────────────────
function InflowCard({ item, onChange, onRemove }: {
  item: PensionInflowItem
  onChange: (patch: Partial<PensionInflowItem>) => void
  onRemove: () => void
}) {
  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input type="text" placeholder="항목명 (예: 희망퇴직위로금)"
          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
        <button onClick={onRemove} className="text-gray-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <AmountInput value={item.amount} onChange={(v) => onChange({ amount: v })} />
      {/* 유형 */}
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
      {/* 목적지 */}
      <div>
        <p className="text-[10px] text-gray-500 mb-1">목적지</p>
        <div className="flex gap-1">
          {([['irp', '퇴직IRP'], ['stock', '일반주식계좌']] as const).map(([v, label]) => (
            <button key={v} onClick={() => onChange({ destination: v })}
              className={cn('flex-1 px-2 py-1 text-[11px] rounded transition-colors',
                item.destination === v ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
              {label}
            </button>
          ))}
        </div>
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

  // 로드 + PENSION 자산 자동 병합 (sources는 과세구분 보존용, 여기선 표시 안 함)
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
    setPlan({ ...EMPTY_PENSION_PLAN, ...base, sources: [...auto, ...manual] })
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
    setPlan((p) => ({ ...p, inflows: [...p.inflows, { id: uid(), name: '', amount: 0, type: 'lumpsum', destination: 'irp' }] }))
    setDirty(true)
  }
  const removeInflow = (id: string) => {
    setPlan((p) => ({ ...p, inflows: p.inflows.filter((i) => i.id !== id) }))
    setDirty(true)
  }

  const handleSave = () => saveMut.mutate(plan, { onSuccess: () => setDirty(false) })

  const r = computePensionVehicle(plan)
  const inflowTotal = totalInflows(plan)
  const irpInflow = plan.inflows.filter((i) => i.destination === 'irp').reduce((s, i) => s + i.amount, 0)
  const stockInflow = plan.inflows.filter((i) => i.destination === 'stock').reduce((s, i) => s + i.amount, 0)

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/pension')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-gray-100 truncate">🪙 연금·개인 vehicle 시뮬</h2>
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
          기존 연금원천(IRP·연금저축)은 그대로 가정, 추가 유입 항목을 <b>퇴직IRP / 일반주식계좌</b>로 굴릴 때의
          연간 세금·건보·순취득 추정. 실제 세금·건보는 규정·연도별 변동 → <b>세무사·노무사 확인 필수</b>.
        </p>
      </div>

      {/* 결과 KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="연금 수령 (IRP·연)" value={formatManwon(r.annualPensionTaxable + r.annualPensionExempt)}
          sub={`과세 ${formatManwon(r.annualPensionTaxable)} + 비과세 ${formatManwon(r.annualPensionExempt)}`} />
        <Kpi label="연금소득세(연)" value={formatManwon(r.pensionTax)} sub="공제 후 누진 3~6%" color="text-red-400" />
        <Kpi label="금융소득(연·배당)" value={formatManwon(r.financialIncome)}
          sub={r.consolidatedFinancial > 0 ? `⚠ ${formatManwon(r.consolidatedFinancial)} 종합합산` : '한도 내 분리과세'}
          color={r.consolidatedFinancial > 0 ? 'text-orange-400' : 'text-emerald-400'} />
        <Kpi label="순취득(연)" value={formatManwon(r.netAnnual)} sub={`세금 ${formatManwon(r.totalAnnualTax)}`} color="text-emerald-400" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="금융소득세(연)" value={formatManwon(r.financialTax)} sub={`분리 ${formatManwon(r.separatedTax)} + 종합 ${formatManwon(r.comprehensiveTax)}`} color="text-red-400" />
        <Kpi label="지역건보(월 추정)" value={formatManwon(r.healthMonthly)} sub="소득분(연금50%·금융100%)" />
        <Kpi label="총 세금(연)" value={formatManwon(r.totalAnnualTax)} sub="연금소득세 + 금융소득세" color="text-red-400" />
        <Kpi label="총 수입(연)" value={formatManwon(r.grossAnnual)} sub="수령 + 금융소득" />
      </div>

      {/* + 유입 항목 */}
      <Expander title="➕ 유입 항목 (목적지 선택)" badge={`${plan.inflows.length}개 · ${formatManwon(inflowTotal)}`} defaultOpen>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          추가로 들어오는 자금을 어디로 굴릴지 선택. <b>퇴직IRP</b> → 연금 원금 합산(수령 시 연금소득세),
          <b> 일반주식계좌</b> → 배당·금융소득(2천만 초과 시 종합과세).
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
      <Expander title="📈 일반주식계좌 포트폴리오" badge={`${formatManwon(r.stockBalance)} · ${plan.stockDividendYield}%`}>
        <Row label="계좌 잔액"><AmountInput value={plan.stockBalance} onChange={(v) => update('stockBalance', v)} /></Row>
        <Row label="배당 수익률" hint="IRP 포트폴리오와 별개 (📊 페이지는 IRP 전용)"><NumInput value={plan.stockDividendYield} onChange={(v) => update('stockDividendYield', v)} suffix="%" /></Row>
        <p className="text-[11px] text-gray-600 leading-relaxed">
          연간 배당 = 잔액 × {plan.stockDividendYield}% = <b className="text-gray-300">{formatManwon(Math.round((plan.stockBalance) * (plan.stockDividendYield / 100)))}</b>.
          금융소득 {formatManwon(FINANCIAL_INCOME_LIMIT)} 초과 시 종합소득세 합산.
        </p>
      </Expander>

      {/* 수령 · 세금 설정 */}
      <Expander title="⚙️ 수령 · 세금 설정">
        <Row label="수령 개시 연도"><NumInput value={plan.startYear} onChange={(v) => update('startYear', v)} /></Row>
        <Row label="수령 기간(연)"><NumInput value={plan.withdrawalYears} onChange={(v) => update('withdrawalYears', v)} suffix="년" /></Row>
        <Row label="기타 종합소득(연)" hint="근로/사업 등 — 금융 초과분과 합산"><AmountInput value={plan.otherIncome} onChange={(v) => update('otherIncome', v)} /></Row>
        <Row label="연금소득공제"><AmountInput value={plan.pensionDeduction} onChange={(v) => update('pensionDeduction', v)} /></Row>
        <Row label="종합소득공제" hint="본인 150만 + 부양가족"><AmountInput value={plan.comprehensiveDeduction} onChange={(v) => update('comprehensiveDeduction', v)} /></Row>
      </Expander>
    </div>
  )
}
