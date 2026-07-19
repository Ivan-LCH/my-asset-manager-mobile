// 연금 시뮬레이션 — 종합소득세 풀 시뮬 (별도 페이지).
// 연금 수령 + 전세금 배당 + 금융소득/종합소득세 + 부부 분산 비교.
// 모든 수치는 사용자 가정에 기반한 추정치.
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ChevronDown, AlertTriangle, Trash2, ArrowLeft, Plus } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import { useAssetsByType } from '@/hooks/useAssets'
import { usePortfolio } from '@/hooks/usePortfolio'
import {
  EMPTY_PENSION_PLAN, simulatePension, totalPrincipal, sourcesFromAssets,
  rentalDividend, spouseSplitComparison, FINANCIAL_INCOME_LIMIT,
} from '@/lib/pensionSim'
import { formatManwon, formatMoney, cn } from '@/lib/utils'
import type { PensionSimPlan, PensionSource, PensionTaxType } from '@/types'

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
      {hint && <p className="text-[11px] text-gray-600 mt-0.5 ml-0 sm:text-right sm:mr-44">{hint}</p>}
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

const TAX_LABELS: Record<PensionTaxType, string> = {
  irp: 'IRP(퇴직)', national: '국민연금', taxable: '과세', taxExempt: '비과세',
}
const TAX_ACTIVE: Record<PensionTaxType, string> = {
  irp: 'bg-blue-600 text-white',
  national: 'bg-cyan-600 text-white',
  taxable: 'bg-orange-600 text-white',
  taxExempt: 'bg-emerald-600 text-white',
}

interface SimTooltipProps { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }
function SimTooltip({ active, payload, label }: SimTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-xl p-3 shadow-2xl min-w-[160px]">
      <p className="text-[11px] text-gray-400 mb-2 font-medium">{label}년</p>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-gray-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="text-[11px] text-gray-100">{formatManwon(p.value)}</span>
          </div>
        ))}
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
  const { data: portfolioData } = usePortfolio()

  const [plan, setPlan] = useState<PensionSimPlan>(EMPTY_PENSION_PLAN)
  const [dirty, setDirty] = useState(false)

  const portfolioYield = portfolioData?.blendedYield ?? 0

  // 로드 + PENSION 자산 자동 병합 (최초 1회)
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

  const updateSource = (idx: number, patch: Partial<PensionSource>) => {
    setPlan((p) => {
      const sources = [...p.sources]
      sources[idx] = { ...sources[idx], ...patch }
      return { ...p, sources }
    })
    setDirty(true)
  }

  const handleSave = () => saveMut.mutate(plan, { onSuccess: () => setDirty(false) })

  // 계산 — 포트폴리오 수익률 + 희망퇴직위로금(IRP 가상 원천) 적용
  const effectivePlan: PensionSimPlan = {
    ...plan,
    sources: [
      ...(portfolioYield > 0 ? plan.sources.map((s) => ({ ...s, yieldRate: portfolioYield })) : plan.sources),
      ...(plan.severancePay > 0
        ? [{ id: '__severance', name: '희망퇴직위로금→IRP', principal: plan.severancePay, taxType: 'irp' as const, yieldRate: portfolioYield > 0 ? portfolioYield : 4 }]
        : []),
    ],
  }
  const sim = simulatePension(effectivePlan)
  const r0 = sim.rows[0]
  const totalP = totalPrincipal(plan) + plan.severancePay

  const rental = rentalDividend(plan)
  const financialIncome = rental.annualDividend + plan.interestIncome
  const ownerLabel = plan.rentalOwner === 'wife' ? '와이프' : '남편'

  // 부부 분산 비교 — 동일 금융소득을 단독 vs 절반 분산
  const split = spouseSplitComparison(financialIncome, plan.otherIncome, plan.comprehensiveDeduction)

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/pension')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-gray-100 truncate">🪙 연금 시뮬레이션 (종합소득세)</h2>
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
          모든 수치는 <b>입력 가정에 기반한 추정치</b>입니다. 연금소득세·종합소득세·건보료는 규정·연도별로 변동 → <b>세무사·노무사 확인 필수</b>.
        </p>
      </div>

      {/* 요약 KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="연금 총액" value={formatManwon(totalP)} sub={`위로금 ${formatManwon(plan.severancePay)} 포함`} />
        <Kpi label="총 순소득 (수령기간)" value={formatManwon(sim.totalNet)} sub={`${plan.withdrawalYears}년 합계`} color="text-emerald-400" />
        <Kpi label="총 세금 (수령기간)" value={formatManwon(sim.totalTax)} sub="연금+분리+종합" color="text-red-400" />
        <Kpi label="첫해 종합소득세" value={formatManwon(r0?.comprehensiveTax ?? 0)} sub="금융초과분 합산" color="text-orange-400" />
      </div>

      {/* 부부 분산 비교 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-200">👥 부부 분산 효과 비교</h3>
          <span className="text-xs text-gray-500">금융소득 {formatManwon(financialIncome)}/년</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-[11px] text-gray-500 mb-1">한 명 명의</p>
            <p className="text-sm sm:text-base font-bold text-gray-100">{formatManwon(split.singleTax)}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">종합합산 {formatManwon(split.singleConsolidated)}</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <p className="text-[11px] text-gray-500 mb-1">부부 절반 분산</p>
            <p className="text-sm sm:text-base font-bold text-blue-400">{formatManwon(split.splitTax)}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">종합합산 {formatManwon(split.splitConsolidated)}</p>
          </div>
          <div className={cn('rounded-lg p-3 border', split.savings >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30')}>
            <p className="text-[11px] text-gray-500 mb-1">분산 효과</p>
            <p className={cn('text-sm sm:text-base font-bold', split.savings >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {split.savings >= 0 ? '절약 ' : '손해 '}{formatManwon(Math.abs(split.savings))}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed">
          {split.savings > 0
            ? `기타 근로/사업소득(${formatManwon(plan.otherIncome)})이 있어 금융 초과분이 고세율 구간으로 밀리면 부부 분산이 유리합니다.`
            : split.savings < 0
              ? '기타소득이 작으면 종합소득세가 6% 구간으로 낮아, 오히려 분리과세(15.4%) 한 명 명의가 유리할 수 있습니다.'
              : '두 방식의 세금이 같습니다.'}
        </p>
      </div>

      {/* 금융소득 2천만 한도 모니터링 */}
      <div className={cn('rounded-xl p-4 border', rental.overLimit > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30')}>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="text-xs text-gray-400">금융소득 ({ownerLabel} 명의) vs {formatManwon(FINANCIAL_INCOME_LIMIT)} 한도</span>
          <span className="text-base font-bold text-gray-100">{formatManwon(financialIncome)}/년</span>
        </div>
        {rental.overLimit > 0 ? (
          <p className="text-[11px] text-red-300 mt-1.5 leading-relaxed">
            ⚠️ 한도 초과 — <b>{formatManwon(rental.overLimit)}</b> 종합소득세 합산 대상. 부부 분산으로 각자 한도 내 관리 권장.
          </p>
        ) : (
          <p className="text-[11px] text-emerald-300 mt-1.5 leading-relaxed">
            ✅ 한도 내 — 이자·배당 15.4% 분리과세 유지.
          </p>
        )}
      </div>

      {/* 연도별 차트 */}
      {sim.rows.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-1">📊 연도별 순소득 vs 세금</h3>
          <p className="text-xs text-gray-500 mb-3">{plan.startYear}년 ~ {plan.startYear + plan.withdrawalYears - 1}년 · {plan.rentalOwner === 'wife' ? '와이프' : '남편'} 명의</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={sim.rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gTax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f87171" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => `${Math.round(v / 10000).toLocaleString()}만`} width={44} />
              <Tooltip content={<SimTooltip />} />
              <Area type="monotone" dataKey="netIncome" name="순소득" stroke="#34d399" strokeWidth={2} fill="url(#gNet)" />
              <Area type="monotone" dataKey="totalTax" name="세금" stroke="#f87171" strokeWidth={2} fill="url(#gTax)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 연금 원천 */}
      <Expander title="✏️ 연금 원천" badge={`${plan.sources.length}개 · 총액 ${formatManwon(totalPrincipal(plan))}`} defaultOpen>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          PENSION 자산이 자동 표시됩니다. 각 원천의 <b>과세 구분</b> 확인:
          IRP(퇴직)·과세(연금저축신규) → 연금소득세, 비과세(98년) → 세금 0.
          운용 수익률은 <b>📊 투자 포트폴리오</b>에서 공통 적용{portfolioYield > 0 ? ` (현재 ${portfolioYield}%)` : ''}.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {plan.sources.map((src, i) => (
            <div key={src.id} className="bg-gray-900/50 rounded-xl border border-gray-700 p-3 space-y-2">
              <div className="flex items-start justify-between gap-1">
                <span className="text-sm text-gray-200 font-medium truncate flex-1">{src.name}</span>
                <button onClick={() => update('sources', plan.sources.filter((_, j) => j !== i))}
                  className="text-gray-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="text-lg font-bold text-gray-100">{formatManwon(src.principal)}</div>
              <div className="flex gap-1 flex-wrap">
                {(['irp', 'national', 'taxable', 'taxExempt'] as PensionTaxType[]).map((t) => (
                  <button key={t} onClick={() => updateSource(i, { taxType: t })}
                    className={cn('px-1.5 py-0.5 text-[10px] rounded transition-colors',
                      src.taxType === t ? TAX_ACTIVE[t] : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
                    {TAX_LABELS[t]}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">원금</label>
                <AmountInput value={src.principal} onChange={(v) => updateSource(i, { principal: v })} />
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => update('sources', [...plan.sources, { id: `manual-${plan.sources.length}`, name: '수동 추가', principal: 0, taxType: 'taxable', yieldRate: 4 }])}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors">
          <Plus className="w-3.5 h-3.5" /> 원천 추가
        </button>
      </Expander>

      {/* 전세금 투자 + 금융소득 */}
      <Expander title="🏠 전세금 투자 · 금융소득" badge={`${ownerLabel} · ${formatManwon(financialIncome)}/년`}>
        <Row label="전세보증금"><AmountInput value={plan.rentalDeposit} onChange={(v) => update('rentalDeposit', v)} /></Row>
        <Row label="배당 수익률"><NumInput value={plan.rentalYield} onChange={(v) => update('rentalYield', v)} suffix="%" /></Row>
        <Row label="기타 이자소득(연)" hint="예금 이자 등 — 배당과 합산"><AmountInput value={plan.interestIncome} onChange={(v) => update('interestIncome', v)} /></Row>
        <Row label="투자 명의">
          <div className="flex gap-1">
            {(['husband', 'wife'] as const).map((o) => (
              <button key={o} onClick={() => update('rentalOwner', o)}
                className={cn('flex-1 px-2 py-1 text-xs rounded transition-colors',
                  plan.rentalOwner === o ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
                {o === 'wife' ? '와이프' : '남편'}
              </button>
            ))}
          </div>
        </Row>
      </Expander>

      {/* 수령 · 세금 설정 */}
      <Expander title="⚙️ 수령 · 종합소득세 설정">
        <Row label="수령 개시 연도"><NumInput value={plan.startYear} onChange={(v) => update('startYear', v)} /></Row>
        <Row label="수령 기간(연)"><NumInput value={plan.withdrawalYears} onChange={(v) => update('withdrawalYears', v)} suffix="년" /></Row>
        <Row label="희망퇴직위로금→IRP" hint="퇴직 시 IRP 이체, 연금 원천에 합산"><AmountInput value={plan.severancePay} onChange={(v) => update('severancePay', v)} /></Row>
        <Row label="기타 종합소득(연)" hint="근로/사업 등 — 은퇴 후 보통 0"><AmountInput value={plan.otherIncome} onChange={(v) => update('otherIncome', v)} /></Row>
        <Row label="연금소득공제"><AmountInput value={plan.pensionDeduction} onChange={(v) => update('pensionDeduction', v)} /></Row>
        <Row label="종합소득공제" hint="본인 150만 + 부양가족"><AmountInput value={plan.comprehensiveDeduction} onChange={(v) => update('comprehensiveDeduction', v)} /></Row>
      </Expander>

      {/* 연도별 결과표 */}
      <Expander title="📋 연도별 결과">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[11px] text-right">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="py-2 px-1 text-left font-medium">연도</th>
                <th className="py-2 px-1 font-medium">연금수령</th>
                <th className="py-2 px-1 font-medium">금융소득</th>
                <th className="py-2 px-1 font-medium">연금소득세</th>
                <th className="py-2 px-1 font-medium">종합소득세</th>
                <th className="py-2 px-1 font-medium">총세금</th>
                <th className="py-2 px-1 font-medium">순소득</th>
              </tr>
            </thead>
            <tbody>
              {sim.rows.map((row) => (
                <tr key={row.year} className="border-b border-gray-800/60">
                  <td className="py-1.5 px-1 text-left text-gray-400">{row.year}</td>
                  <td className="py-1.5 px-1 text-gray-200">{formatManwon(row.totalWithdraw)}</td>
                  <td className="py-1.5 px-1 text-gray-300">{formatManwon(row.financialIncome)}</td>
                  <td className="py-1.5 px-1 text-red-300/80">{formatManwon(row.pensionTax)}</td>
                  <td className="py-1.5 px-1 text-orange-300/80">{formatManwon(row.comprehensiveTax)}</td>
                  <td className="py-1.5 px-1 text-red-400">{formatManwon(row.totalTax)}</td>
                  <td className="py-1.5 px-1 text-emerald-400 font-semibold">{formatManwon(row.netIncome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Expander>
    </div>
  )
}
