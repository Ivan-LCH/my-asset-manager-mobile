import { useState, useEffect, useCallback, useRef } from 'react'
import { Save, ChevronDown, AlertTriangle, Trash2 } from 'lucide-react'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import { useAssetsByType } from '@/hooks/useAssets'
import { usePortfolio } from '@/hooks/usePortfolio'
import { EMPTY_PENSION_PLAN, simulatePension, totalPrincipal, sourcesFromAssets, pensionIncomeTax } from '@/lib/pensionSim'
import { formatManwon } from '@/lib/utils'
import type { PensionSimPlan, PensionSource, PensionTaxType } from '@/types'

// ── 헬퍼 ───────────────────────────────────────────────────
function numFmt(v: number) { return v > 0 ? Math.round(v).toLocaleString() : '' }
function parseNum(s: string) { return Number(s.replace(/,/g, '')) || 0 }

function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

function Expander({ title, badge, children, defaultOpen = false }: {
  title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 text-left hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-200 truncate">{title}</span>
          {badge && <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">{badge}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-gray-700 space-y-4">{children}</div>}
    </div>
  )
}

function AmountInput({ value, onChange, placeholder = '금액' }: {
  value: number; onChange: (v: number) => void; placeholder?: string
}) {
  const [raw, setRaw] = useState(value > 0 ? numFmt(value) : '')
  useEffect(() => { setRaw(value > 0 ? numFmt(value) : '') }, [value])
  return (
    <input
      type="text" inputMode="numeric"
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
      <input
        type="number" inputMode="decimal"
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
        value={value || ''} onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && <span className="text-xs text-gray-500 shrink-0">{suffix}</span>}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="w-40 sm:w-48 shrink-0">{children}</div>
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
  irp: 'IRP(퇴직)',
  national: '국민연금',
  taxable: '과세',
  taxExempt: '비과세',
}

const TAX_COLORS: Record<PensionTaxType, string> = {
  irp: 'text-blue-400',
  national: 'text-cyan-400',
  taxable: 'text-orange-400',
  taxExempt: 'text-emerald-400',
}

// ── 메인 ───────────────────────────────────────────────────
export default function PensionSimPage() {
  const { data: saved } = usePensionSim()
  const saveMut = useSavePensionSim()
  const pensionAssets = useAssetsByType('PENSION')
  const { data: portfolioData } = usePortfolio()

  const [plan, setPlan] = useState<PensionSimPlan>(EMPTY_PENSION_PLAN)
  const [dirty, setDirty] = useState(false)

  // 포트폴리오 수익률
  const portfolioYield = portfolioData?.blendedYield ?? 0

  // 로드 + PENSION 자산 자동 병합 (최초 1회만)
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    if (!saved && pensionAssets.length === 0) return
    didInit.current = true

    const base = saved ?? EMPTY_PENSION_PLAN
    const currentSources = plan.sources.length > 0 ? plan.sources : base.sources
    const autoSources = sourcesFromAssets(
      pensionAssets.map((a) => ({
        id: a.id, name: a.name, currentValue: a.currentValue,
        detail: { pensionType: (a.detail as { pensionType?: string })?.pensionType },
      })),
      currentSources,
    )
    const manualSources = currentSources.filter((s) => !pensionAssets.find((a) => a.id === s.id))
    setPlan({
      ...EMPTY_PENSION_PLAN,
      ...base,
      sources: [...autoSources, ...manualSources],
    })
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

  // 포트폴리오 수익률을 각 원천에 적용
  const effectivePlan: PensionSimPlan = {
    ...plan,
    sources: portfolioYield > 0
      ? plan.sources.map((s) => ({ ...s, yieldRate: portfolioYield }))
      : plan.sources,
  }
  const sim = simulatePension(effectivePlan)
  const r0 = sim.rows[0]
  const totalP = totalPrincipal(plan)

  // 과세별 합산
  const irpTotal = plan.sources.filter((s) => s.taxType === 'irp').reduce((s, src) => s + src.principal, 0)
  const taxableTotal = plan.sources.filter((s) => s.taxType === 'taxable').reduce((s, src) => s + src.principal, 0)
  const exemptTotal = plan.sources.filter((s) => s.taxType === 'taxExempt').reduce((s, src) => s + src.principal, 0)

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100">🪙 연금 시뮬레이션 (IRP)</h2>
        <button
          onClick={handleSave} disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40"
        >
          <Save className="w-4 h-4" />
          {saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      {/* 면책 */}
      <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-200/90 leading-relaxed">
          모든 수치는 <b>입력 가정에 기반한 추정치</b>입니다. 연금소득세·건보료는 규정·연도별로 변동 → <b>세무사·노무사 확인 필수</b>.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="연금 총액" value={formatManwon(totalP)} sub={`IRP ${formatManwon(irpTotal)} + 기타 ${formatManwon(taxableTotal + exemptTotal)}`} />
        <Kpi label="연 수령액" value={formatManwon(r0?.totalWithdraw ?? 0)} sub={`${plan.withdrawalYears}년 × 균등인출`} />
        <Kpi label="연금소득세(연)" value={formatManwon(r0?.pensionTax ?? 0)} sub={`공제 ${formatManwon(plan.pensionDeduction)} 후 누진`} color="text-red-400" />
        <Kpi label="순수령액(연)" value={formatManwon(r0?.netIncome ?? 0)} sub="수령 − 세금" color="text-emerald-400" />
      </div>

      {/* 연금 원천 타일 (2 per line) */}
      <Expander title="✏️ 연금 원천" badge={`${plan.sources.length}개 · 총액 ${formatManwon(totalP)}`} defaultOpen>
        <Section>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            PENSION 자산이 자동으로 표시됩니다. 각 원천의 <b>과세 구분</b>을 확인하세요:
            IRP(퇴직)·과세(연금저축신규) → 연금소득세, 비과세(98년) → 세금 0.
            운용 수익률은 <b>📊 투자 포트폴리오</b>에서 공통 적용{portfolioYield > 0 ? ` (현재 ${portfolioYield}%)` : ''}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {plan.sources.map((src, i) => (
              <div key={src.id} className="bg-gray-900/50 rounded-xl border border-gray-700 p-3 space-y-2">
                <div className="flex items-start justify-between gap-1">
                  <span className="text-sm text-gray-200 font-medium truncate flex-1">{src.name}</span>
                  <button
                    onClick={() => update('sources', plan.sources.filter((_, j) => j !== i))}
                    className="text-gray-600 hover:text-red-400 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className={`text-lg font-bold ${TAX_COLORS[src.taxType]}`}>
                  {formatManwon(src.principal)}
                </div>
                <div className="flex gap-1">
                  {(['irp', 'national', 'taxable', 'taxExempt'] as PensionTaxType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateSource(i, { taxType: t })}
                      className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                        src.taxType === t ? `${t === 'irp' ? 'bg-blue-600' : t === 'taxable' ? 'bg-orange-600' : 'bg-emerald-600'} text-white` : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {TAX_LABELS[t]}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">원금 (자산에서 자동)</label>
                  <AmountInput value={src.principal} onChange={(v) => updateSource(i, { principal: v })} />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => update('sources', [...plan.sources, { id: `manual-${Date.now()}`, name: '수동 추가', principal: 0, taxType: 'taxable', yieldRate: 4 }])}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
          >
            ＋ 원천 추가
          </button>
        </Section>
      </Expander>

      {/* 수령 설정 */}
      <Expander title="✏️ 수령 설정">
        <Section>
          <Row label="수령 개시 연도"><NumInput value={plan.startYear} onChange={(v) => update('startYear', v)} /></Row>
          <Row label="수령 기간(연)"><NumInput value={plan.withdrawalYears} onChange={(v) => update('withdrawalYears', v)} suffix="년" /></Row>
          <Row label="ISA 잔액"><AmountInput value={plan.isaBalance} onChange={(v) => update('isaBalance', v)} /></Row>
        </Section>
      </Expander>

      {/* 세금 요약 */}
      <Expander title="📊 세금 요약" defaultOpen>
        <Section>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">과세 대상 (IRP + 과세)</p>
              <p className="text-base font-bold text-blue-400">{formatManwon(irpTotal + taxableTotal)}</p>
              <p className="text-[11px] text-gray-600 mt-1">연금소득세 3~6% 누진 (1,200만 공제)</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">비과세 (98년 연금저축)</p>
              <p className="text-base font-bold text-emerald-400">{formatManwon(exemptTotal)}</p>
              <p className="text-[11px] text-gray-600 mt-1">수령 시 세금 0</p>
            </div>
          </div>
          <Row label="연금소득세(연, 첫 해 기준)"><span className="text-sm text-red-400 text-right w-full block">{formatManwon(r0?.pensionTax ?? 0)}</span></Row>
          <Row label="과세표준"><span className="text-sm text-gray-300 text-right w-full block">{formatManwon(r0?.pensionTaxable ?? 0)}</span></Row>
          <Row label="순수령액(연, 첫 해)"><span className="text-sm text-emerald-400 font-bold text-right w-full block">{formatManwon(r0?.netIncome ?? 0)}</span></Row>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            연금소득 = IRP 수령 + 과세 연금저축 수령. 여기서 연금소득공제 1,200만원을 뺀 과세표준에 3~6% 누진세율 적용.
            비과세(98년) 연금저축은 연금소득에 포함되지 않음.
          </p>
        </Section>
      </Expander>
    </div>
  )
}
