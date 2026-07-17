import { useState, useEffect, useCallback, useRef } from 'react'
import { Save, ChevronDown, AlertTriangle, Wallet } from 'lucide-react'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import { useAssetsByType } from '@/hooks/useAssets'
import { EMPTY_PENSION_PLAN, simulatePension, totalPrincipal, sourcesFromAssets } from '@/lib/pensionSim'
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
  taxable: '과세',
  taxExempt: '비과세(98년)',
}

// ── 메인 ───────────────────────────────────────────────────
export default function PensionSimPage() {
  const { data: saved } = usePensionSim()
  const saveMut = useSavePensionSim()
  const pensionAssets = useAssetsByType('PENSION')

  const [plan, setPlan] = useState<PensionSimPlan>(EMPTY_PENSION_PLAN)
  const [dirty, setDirty] = useState(false)

  // 로드 + PENSION 자산 자동 병합 (최초 1회만, 이후 수동 편집 보존)
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    if (!saved && pensionAssets.length === 0) return
    didInit.current = true

    const base = saved ?? EMPTY_PENSION_PLAN
    // 수동 편집된 sources(현재 plan)가 있으면 우선, 없으면 saved/EMPTY
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

  const sim = simulatePension(plan)
  const r0 = sim.rows[0]
  const totalP = totalPrincipal(plan)

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100">🪙 연금 시뮬레이션 (IRP)</h2>
        <button
          onClick={handleSave} disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 self-start"
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
        <Kpi label="연 수령액" value={formatManwon(r0?.totalWithdraw ?? 0)} sub={`원금 ${formatManwon(totalP)} / ${plan.withdrawalYears}년`} />
        <Kpi label="연금소득세(연)" value={formatManwon(r0?.pensionTax ?? 0)} sub={`과세표준 ${formatManwon(r0?.pensionTaxable ?? 0)}`} color="text-red-400" />
        <Kpi label="전세금 수익(연)" value={formatManwon(r0?.isaIncome ?? 0)} sub={`세후 ${formatManwon((r0?.isaIncome ?? 0) - (r0?.isaTax ?? 0))}`} color="text-blue-400" />
        <Kpi label="순수령액(연)" value={formatManwon(r0?.netIncome ?? 0)} sub="수령 + 투자수익 − 세금" color="text-emerald-400" />
      </div>

      {/* 입력: 연금 원천 */}
      <Expander title="✏️ 연금 원천 (PENSION 자산 자동)" badge={`총액 ${formatManwon(totalP)}`} defaultOpen>
        <Section>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            PENSION 자산이 자동으로 표시됩니다. 각 원천의 <b>과세 구분</b>을 확인하세요:
            IRP(퇴직)·과세(연금저축신규) → 연금소득세, 비과세(98년) → 세금 0.
          </p>
          {plan.sources.map((src, i) => (
            <div key={src.id} className="bg-gray-900/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-200 font-medium truncate flex-1">{src.name}</span>
                <button
                  onClick={() => update('sources', plan.sources.filter((_, j) => j !== i))}
                  className="text-xs text-gray-600 hover:text-red-400 shrink-0"
                >
                  삭제
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-500 block mb-0.5">원금</label>
                  <AmountInput value={src.principal} onChange={(v) => updateSource(i, { principal: v })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-0.5">운용 수익률</label>
                  <NumInput value={src.yieldRate} onChange={(v) => updateSource(i, { yieldRate: v })} suffix="%" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 block mb-0.5">과세 구분</label>
                <div className="flex gap-1">
                  {(['irp', 'taxable', 'taxExempt'] as PensionTaxType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => updateSource(i, { taxType: t })}
                      className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
                        src.taxType === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {TAX_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => update('sources', [...plan.sources, { id: `manual-${Date.now()}`, name: '수동 추가', principal: 0, taxType: 'taxable', yieldRate: 4 }])}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
          >
            ＋ 원천 추가
          </button>
        </Section>
      </Expander>

      {/* 입력: 수령 설정 */}
      <Expander title="✏️ 수령 설정 + 자산">
        <Section>
          <Row label="수령 개시 연도"><NumInput value={plan.startYear} onChange={(v) => update('startYear', v)} /></Row>
          <Row label="수령 기간(연)"><NumInput value={plan.withdrawalYears} onChange={(v) => update('withdrawalYears', v)} suffix="년" /></Row>
          <Row label="ISA 잔액"><AmountInput value={plan.isaBalance} onChange={(v) => update('isaBalance', v)} /></Row>
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">전세금/보증금 투자</p>
            <Row label="전세금/보증금"><AmountInput value={plan.rentalDeposit} onChange={(v) => update('rentalDeposit', v)} /></Row>
            <Row label="투자 수익률"><NumInput value={plan.rentalYield} onChange={(v) => update('rentalYield', v)} suffix="%" /></Row>
          </div>
        </Section>
      </Expander>

      {/* ISA 만기 세금 */}
      <Expander title="📊 ISA 세금">
        <Section>
          <Row label="ISA 잔액"><span className="text-sm text-gray-100 text-right w-full block">{formatManwon(plan.isaBalance)}</span></Row>
          <Row label="비과세 한도"><span className="text-sm text-emerald-400 text-right w-full block">이자·배당 연 200만원까지 면세</span></Row>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            ISA 운용 중 발생한 이자·배당 소득 중 연 200만원(중개형)까지 비과세. 만기 시 전액 수령하면 초과분에 9.9% 분리과세.
            만기 후 연금계좌(IRP/연금저축)로 이전 시 세액공제 추가 (전환액의 10%, 최대 30만원).
            ISA 수익은 건강보험료 소득 산정에서 제외.
          </p>
        </Section>
      </Expander>

      {/* 전세금 투자 시나리오 */}
      <Expander title="📊 전세금 투자 시나리오">
        <Section>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            전세금/보증금 수령 후 투자 운용 시뮬레이션. 수익률별 월/연 수익 + ISA 분리과세 9.9% 후 순수익.
          </p>
          <Row label="전세금/보증금"><span className="text-sm text-gray-100 text-right w-full block">{formatManwon(plan.rentalDeposit)}</span></Row>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { label: '예금(3.5%)', rate: 3.5 },
              { label: '국채(4%)', rate: 4 },
              { label: '배당ETF(6%)', rate: 6 },
            ].map((s) => {
              const annual = plan.rentalDeposit * (s.rate / 100)
              const net = annual * (1 - 0.099)
              return (
                <div key={s.rate} className={`rounded-lg p-2 cursor-pointer transition-colors ${plan.rentalYield === s.rate ? 'bg-blue-600/20 border border-blue-500/40' : 'bg-gray-900/50 border border-gray-700'}`}
                  onClick={() => update('rentalYield', s.rate)}
                >
                  <p className="text-xs text-gray-400">{s.label}</p>
                  <p className="text-sm font-bold text-blue-400">{Math.round(annual / 10000).toLocaleString()}만</p>
                  <p className="text-[11px] text-gray-500">세후 {Math.round(net / 10000).toLocaleString()}만</p>
                </div>
              )
            })}
          </div>
        </Section>
      </Expander>
    </div>
  )
}
