import { useState, useEffect, useCallback } from 'react'
import { Save, ChevronDown, AlertTriangle, Trash2, RefreshCw } from 'lucide-react'
import { useCorpSim, useSaveCorpSim } from '@/hooks/useCorpSim'
import { useAssets } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { useRetirement } from '@/hooks/useRetirement'
import {
  EMPTY_CORP_PLAN, DEFAULT_CORP_TAX, grossDividend, computeCorp, computePersonal,
  sonAccumulation, returnMonths, recommendDividendForSon, shareSum, simulateRunway, totalInvest,
  computeTwoPhase, blendedYield, salariedCount, comprehensiveTax, corpHealthMonthly,
} from '@/lib/corpSim'
import { calcPensionByYear, SIM_START_YEAR } from '@/lib/pensionCalc'
import { formatManwon } from '@/lib/utils'
import type { CorpSimPlan, CorpTaxParams, PortfolioHolding, PortfolioYield } from '@/types'

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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="w-40 sm:w-48 shrink-0">{children}</div>
    </div>
  )
}

// ── 메인 ───────────────────────────────────────────────────
export default function CorpSimPage() {
  const { data: saved } = useCorpSim()
  const saveMut = useSaveCorpSim()
  const { data: allAssets = [] } = useAssets()
  const { data: settings } = useSettings()
  const { data: retirementPlan } = useRetirement()

  const [plan, setPlan] = useState<CorpSimPlan>(EMPTY_CORP_PLAN)
  const [dirty, setDirty] = useState(false)
  const [sonYears, setSonYears] = useState(10)
  const [yields, setYields] = useState<PortfolioYield[]>([])
  const [loadingYields, setLoadingYields] = useState(false)

  useEffect(() => {
    if (saved) {
      const oldInvest = (saved as unknown as Record<string, unknown>).investAmount as number | undefined
      setPlan({
        ...EMPTY_CORP_PLAN,
        ...saved,
        // 구버전(investAmount) → 가수금으로 마이그레이션
        loanAmount: saved.loanAmount ?? (oldInvest ?? EMPTY_CORP_PLAN.loanAmount),
        tax: { ...DEFAULT_CORP_TAX, ...(saved.tax ?? {}) },
      })
    }
  }, [saved])

  const update = useCallback(<K extends keyof CorpSimPlan>(key: K, val: CorpSimPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])
  const updateTax = useCallback(<K extends keyof CorpTaxParams>(key: K, val: CorpTaxParams[K]) => {
    setPlan((p) => ({ ...p, tax: { ...p.tax, [key]: val } }))
    setDirty(true)
  }, [])
  const handleSave = () => saveMut.mutate(plan, { onSuccess: () => setDirty(false) })

  // 배당주 포트폴리오 수익률 자동 산정
  const fetchYields = async () => {
    setLoadingYields(true)
    const tickers = plan.portfolio.map((h) => h.ticker).filter(Boolean)
    const results: PortfolioYield[] = await Promise.all(
      tickers.map(async (t) => {
        try {
          const r = await fetch(`/api/yield?ticker=${encodeURIComponent(t)}`)
          if (!r.ok) return { ticker: t, yield: 0 }
          const d = await r.json()
          return { ticker: t, yield: d.avg3yYield ?? 0 }
        } catch {
          return { ticker: t, yield: 0 }
        }
      }),
    )
    setYields(results)
    const blended = blendedYield(results, plan.portfolio)
    update('dividendYield', Math.round(blended * 100) / 100)
    setLoadingYields(false)
  }

  // ── 연금 자동 연동 ──
  const currentAge = settings?.currentAge ?? 40
  const retirementYear = retirementPlan?.retirementYear ?? new Date().getFullYear() + 10
  let pensionAnnual = plan.pensionIncomeAnnual
  if (plan.linkPension) {
    const pensionMap = calcPensionByYear(allAssets, currentAge)
    pensionAnnual = (pensionMap.get(retirementYear) ?? 0) * 12
  }
  const effectivePlan: CorpSimPlan = { ...plan, pensionIncomeAnnual: pensionAnnual }

  const corp = computeCorp(effectivePlan)
  const personal = computePersonal(effectivePlan)
  const accum = sonAccumulation(effectivePlan, sonYears)
  const months = returnMonths(effectivePlan)
  const recommend = recommendDividendForSon(effectivePlan)
  const shareOk = shareSum(effectivePlan) === 100
  const runway = simulateRunway(effectivePlan)
  const firstNet = runway.rows[0]?.net ?? 0
  const twoPhase = computeTwoPhase(effectivePlan)

  // After 소득세 = 법인세 + 주주 배당세 총합(distributable × 15.4%)
  const afterTax = corp.corpTax + corp.distributable * plan.tax.dividendTaxRate
  const beforeTax = personal.dividendTax + personal.combinedExtra

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100">🏛️ 투자법인 시뮬레이터</h2>
        <button
          onClick={handleSave} disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 self-start"
        >
          <Save className="w-4 h-4" />
          {saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      {/* 면책 배너 */}
      <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-200/90 leading-relaxed">
          본 시뮬레이터의 모든 수치는 <b>입력 가정에 기반한 추정치</b>입니다. 세율·공식은 편집 가능하나,
          실제 세금·건강보험료는 개인 상황과 연도별 규정에 따라 다릅니다. 적용 전 <b>반드시 세무사·노무사에 확인</b>하세요.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="연간 법인 배당(세전)" value={formatManwon(corp.grossDividend)} sub={plan.targetDividendTotal > 0 ? '수동 지정' : `원금 × ${plan.dividendYield}%`} />
        <Kpi label="법인세(연)" value={formatManwon(corp.corpTax)} sub="초과누진 적용" color="text-red-400" />
        <Kpi label="아들 수령 배당(연·세후)" value={formatManwon(corp.perShare.son.net)} sub={`지분 ${plan.shareSon}%`} color="text-emerald-400" />
        <Kpi
          label="연간 현금 잔여"
          value={`${firstNet >= 0 ? '+' : ''}${formatManwon(firstNet)}`}
          sub={runway.sustainable ? '지속가능(원금 보존)' : '초과인출 → 원금 매도'}
          color={firstNet >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
      </div>

      {/* 입력① 자산·운용 */}
      <Expander title="✏️ 입력 ① 자산 · 운용" badge={`총운용 ${formatManwon(totalInvest(plan))}`} defaultOpen>
        <Section>
          <Row label="출자금(자본금)"><AmountInput value={plan.capitalContribution} onChange={(v) => update('capitalContribution', v)} /></Row>
          <Row label="가수금(대여금)"><AmountInput value={plan.loanAmount} onChange={(v) => update('loanAmount', v)} /></Row>
          {plan.portfolio.length > 0 ? (
            <Row label="배당수익률(자동)">
              <span className="text-sm text-blue-400 text-right w-full block">
                {plan.dividendYield}% <span className="text-gray-500 text-[11px]">(포트폴리오 산정)</span>
              </span>
            </Row>
          ) : (
            <Row label="예상 배당수익률"><NumInput value={plan.dividendYield} onChange={(v) => update('dividendYield', v)} suffix="%" /></Row>
          )}
          <Row label="연 배당총액(0=자동)"><AmountInput value={plan.targetDividendTotal} onChange={(v) => update('targetDividendTotal', v)} placeholder="0" /></Row>
          <Row label="가수금 월 반환(생활비)"><AmountInput value={plan.monthlyReturn} onChange={(v) => update('monthlyReturn', v)} /></Row>
        </Section>
      </Expander>

      {/* 입력② 지분·운영 */}
      <Expander title="✏️ 입력 ② 지분 · 운영" badge={shareOk ? `지분 ${shareSum(plan)}%` : `⚠ 합 ${shareSum(plan)}%`}>
        <Section>
          <div className="grid grid-cols-3 gap-2">
            <Field label="부 지분(%)"><NumInput value={plan.shareHusband} onChange={(v) => update('shareHusband', v)} /></Field>
            <Field label="모 지분(%)"><NumInput value={plan.shareWife} onChange={(v) => update('shareWife', v)} /></Field>
            <Field label="자 지분(%)"><NumInput value={plan.shareSon} onChange={(v) => update('shareSon', v)} /></Field>
          </div>
          <Row label="대표(아내) 월급"><AmountInput value={plan.repSalaryMonthly} onChange={(v) => update('repSalaryMonthly', v)} /></Row>
          <Row label="남편(본인) 월급"><AmountInput value={plan.repSalaryHusbandMonthly} onChange={(v) => update('repSalaryHusbandMonthly', v)} /></Row>
          <Row label="직장건보(월·자동)">
            <span className="text-sm text-blue-400 text-right w-full block">
              {formatManwon(corpHealthMonthly(effectivePlan))} <span className="text-gray-500 text-[11px]">(급여×{(plan.tax.healthInsRate * 100).toFixed(2)}%×50%)</span>
            </span>
          </Row>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer py-1">
            <input type="checkbox" checked={plan.sonEmployed} onChange={(e) => update('sonEmployed', e.target.checked)} className="accent-blue-500" />
            아들 취업 상태 (건보 마진 한계 2천만 / 미취업 1천만)
          </label>
          <div className="pt-2 border-t border-gray-700">
            <label className={`flex items-center gap-2 text-sm cursor-pointer py-1 ${plan.linkPension ? 'text-blue-400' : 'text-gray-400'}`}>
              <input type="checkbox" checked={plan.linkPension} onChange={(e) => update('linkPension', e.target.checked)} className="accent-blue-500" />
              🏛️ 연금 자동 연동 (은퇴 계획에서)
            </label>
            {plan.linkPension ? (
              <Row label="연금소득(연·자동)"><span className="text-sm text-blue-400 text-right w-full block">{formatManwon(pensionAnnual)} <span className="text-gray-500">({retirementYear}년 기준)</span></span></Row>
            ) : (
              <Row label="연금소득(연·수동)"><AmountInput value={plan.pensionIncomeAnnual} onChange={(v) => update('pensionIncomeAnnual', v)} /></Row>
            )}
          </div>
          <p className="text-[11px] text-gray-600 pt-2 border-t border-gray-700">
            비교용 가정(개인명의 건보·승계재산·설립비)는 입력하지 않아도 됨 — 기본값으로 표시. 변경은 아래 <b>'세제 · 비교 파라미터'</b>에서.
          </p>
        </Section>
      </Expander>

      {/* 배당주 포트폴리오 */}
      <Expander title="📊 배당주 포트폴리오 (수익률 자동 산정)" badge={`현재 ${plan.dividendYield}%`}>
        <Section>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            종목과 비중을 입력하고 "자동 산정"을 누르면 Yahoo에서 3년 평균 배당률을 가져와 가중평균 → 시뮬 수익률 자동 반영.
          </p>
          {plan.portfolio.map((h, i) => {
            const y = yields.find((v) => v.ticker === h.ticker)?.yield
            return (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  className="w-28 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                  value={h.ticker}
                  onChange={(e) => { const p = [...plan.portfolio]; p[i] = { ...p[i], ticker: e.target.value.toUpperCase() }; update('portfolio', p) }}
                  placeholder="TICKER"
                />
                <input
                  type="number" inputMode="decimal"
                  className="w-16 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 text-center focus:outline-none focus:border-blue-500"
                  value={h.weight || ''}
                  onChange={(e) => { const p = [...plan.portfolio]; p[i] = { ...p[i], weight: Number(e.target.value) }; update('portfolio', p) }}
                />
                <span className="text-xs text-gray-500">비중</span>
                {typeof y === 'number' && y > 0 && <span className="text-xs text-emerald-400 shrink-0 ml-auto">{y.toFixed(2)}%</span>}
                <button
                  onClick={() => update('portfolio', plan.portfolio.filter((_, j) => j !== i))}
                  className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => update('portfolio', [...plan.portfolio, { ticker: '', weight: 1 }])}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              ＋ 종목 추가
            </button>
            <button
              onClick={() => void fetchYields()}
              disabled={loadingYields}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingYields ? 'animate-spin' : ''}`} />
              {loadingYields ? '조회 중...' : '배당률 자동 산정'}
            </button>
          </div>
        </Section>
      </Expander>

      {/* 결과 상세 */}
      <Expander title="📊 결과 — 법인 시나리오 상세" badge={`법인세 ${formatManwon(corp.corpTax)}`}>
        <Section>
          <Row label="ETF 배당 수입(연)"><span className="text-sm text-gray-100 text-right w-full block">{formatManwon(corp.grossDividend)}</span></Row>
          <Row label="− 법인세"><span className="text-sm text-red-400 text-right w-full block">− {formatManwon(corp.corpTax)}</span></Row>
          <Row label="− 급여(부부, 법인 비용)"><span className="text-sm text-orange-400 text-right w-full block">− {formatManwon((plan.repSalaryMonthly + plan.repSalaryHusbandMonthly) * 12)}</span></Row>
          <Row label="− 4대보험 사업주분(연)"><span className="text-sm text-orange-400 text-right w-full block">− {formatManwon(corp.employerInsAnnual.total)}</span></Row>
          <Row label="− 법인 유지비(연)"><span className="text-sm text-orange-400 text-right w-full block">− {formatManwon(corp.maintAnnual)}</span></Row>
          <Row label="= 배당가능(잔여)"><span className="text-sm text-emerald-400 text-right w-full block">{formatManwon(corp.distributable)}</span></Row>
          <p className="text-[11px] text-gray-600 pt-2">배당가능 잔여를 주주 지분율로 분배. 주주 수령 시 <b>개인 배당소득세 15.4%</b> 원천징수 (법인세와 별개).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs mt-2">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 pr-3">주주</th>
                <th className="text-right py-2 px-2">지분</th>
                <th className="text-right py-2 px-2">배당(세전)</th>
                <th className="text-right py-2 px-2">개인 배당세 15.4%</th>
                <th className="text-right py-2 pl-2">수령(세후)</th>
              </tr></thead>
              <tbody>
                {([['부', plan.shareHusband, corp.perShare.husband], ['모', plan.shareWife, corp.perShare.wife], ['자', plan.shareSon, corp.perShare.son]] as const).map(([n, sh, ps]) => (
                  <tr key={n} className="border-b border-gray-700/50">
                    <td className="py-2 pr-3 text-gray-300">{n}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{sh}%</td>
                    <td className="text-right py-2 px-2 text-gray-200">{formatManwon(ps.gross)}</td>
                    <td className="text-right py-2 px-2 text-red-400">− {formatManwon(ps.gross * plan.tax.dividendTaxRate)}</td>
                    <td className="text-right py-2 pl-2 text-emerald-400 font-semibold">{formatManwon(ps.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Row label="건보 본인부담(연)"><span className="text-sm text-gray-400 text-right w-full block">{formatManwon(corp.corpHealthAnnual)}</span></Row>
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-1">4대보험 사업주 부담(연)</p>
            <Row label="　건보 사업주 50%"><span className="text-sm text-orange-400 text-right w-full block">− {formatManwon(corp.employerInsAnnual.health)}</span></Row>
            <Row label="　국민연금 사업주 4.5%"><span className="text-sm text-orange-400 text-right w-full block">− {formatManwon(corp.employerInsAnnual.pension)}</span></Row>
            <Row label="　고용보험 사업주 0.9%"><span className="text-sm text-orange-400 text-right w-full block">− {formatManwon(corp.employerInsAnnual.employment)}</span></Row>
            <Row label="　산재보험 사업주 0.7%"><span className="text-sm text-orange-400 text-right w-full block">− {formatManwon(corp.employerInsAnnual.accident)}</span></Row>
            <Row label="　소계"><span className="text-sm text-red-400 text-right w-full block">− {formatManwon(corp.employerInsAnnual.total)}</span></Row>
          </div>
          <Row label="법인 유지비(연)"><span className="text-sm text-gray-400 text-right w-full block">{formatManwon(corp.maintAnnual)}</span></Row>
        </Section>
      </Expander>

      {/* 현금흐름 / 지속가능성 */}
      <Expander
        title="📊 현금흐름 / 지속가능성"
        badge={runway.sustainable ? '지속가능' : '초과인출'}
        defaultOpen
      >
        <Section>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            법인의 연간 배당 수입(현금 유입)이 가족이 빼는 돈(급여+가수금반환)을 커버하면 <b>원금(ETF) 보존 → 지속가능</b>.
            못하면 ETF 원금을 매도해 부족분을 메워야 → 원금 감소 → 배당도 줄고 → 가속적 고갈.
          </p>
          {(() => {
            const r0 = runway.rows[0]
            if (!r0) return null
            return (
              <>
                <Row label="현금 유입(배당수입)"><span className="text-sm text-emerald-400 text-right w-full block">{formatManwon(r0.cashIn)}</span></Row>
                <Row label="− 법인세"><span className="text-sm text-red-400 text-right w-full block">− {formatManwon(r0.tax)}</span></Row>
                <Row label="− 가족 인출(급여+가수금)"><span className="text-sm text-red-400 text-right w-full block">− {formatManwon(r0.familyDraw)}</span></Row>
                <Row label="= 연간 잔여"><span className={`text-sm font-bold text-right w-full block ${r0.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r0.net >= 0 ? '+' : ''}{formatManwon(r0.net)}</span></Row>
              </>
            )
          })()}

          <Row label={`가수금(${formatManwon(plan.loanAmount)}) 전액 회수`}>
            <span className="text-sm text-gray-300 text-right w-full block">
              {months > 0 ? `${Math.floor(months / 12)}년 ${months % 12}개월` : '—'} <span className="text-gray-500">(월 {formatManwon(plan.monthlyReturn)})</span>
            </span>
          </Row>

          {runway.sustainable ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-300">
              ✅ 지속가능 — 원금을 매도하지 않아도 됨. 잉여 {formatManwon(runway.rows[0]?.surplus ?? 0)}는 배당·재투자 가능.
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300 leading-relaxed">
              ⚠️ <b>초과인출</b> — 연간 {formatManwon(runway.annualShortfall)} 부족 → ETF 원금 매도로 메워야.
              현재 설정으론 원금이 매년 줄어 배당도 감소,{' '}
              <b>{runway.depletedYear ?? '?'}년 차 원금 고갈 예상</b>.
              급여·가수금반환을 줄이거나 수익률·원금을 늘려야 지속가능.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 pr-3">연도</th>
                <th className="text-right py-2 px-2">잔존 원금</th>
                <th className="text-right py-2 px-2">배당수입</th>
                <th className="text-right py-2 pl-2">잔여(매도−)</th>
              </tr></thead>
              <tbody>
                {runway.rows.slice(0, 6).map((r) => (
                  <tr key={r.year} className={`border-b border-gray-700/50 ${r.principal <= 0 ? 'bg-red-500/5' : ''}`}>
                    <td className="py-2 pr-3 text-gray-300">{r.year}{r.principal <= 0 && <span className="ml-1 text-[10px] text-red-400">고갈</span>}</td>
                    <td className="text-right py-2 px-2 text-gray-200">{formatManwon(r.principal)}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{formatManwon(r.cashIn)}</td>
                    <td className={`text-right py-2 pl-2 ${r.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.net >= 0 ? '+' : ''}{formatManwon(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Expander>

      {/* Before vs After */}
      <Expander title="📊 Before vs After 대조" badge={`연간 차이 ${formatManwon((beforeTax + personal.personalHealthAnnual) - (afterTax + corp.corpHealthAnnual + corp.maintAnnual))}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-2 pr-3">구분</th>
              <th className="text-right py-2 px-2">개인 명의(Before)</th>
              <th className="text-right py-2 pl-2">법인 가동(After)</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 pr-3 text-gray-300">건강보험료(연)</td>
                <td className="text-right py-2 px-2 text-red-400">{formatManwon(personal.personalHealthAnnual)}</td>
                <td className="text-right py-2 pl-2 text-emerald-400">{formatManwon(corp.corpHealthAnnual)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 pr-3 text-gray-300">4대보험 사업주분(연)</td>
                <td className="text-right py-2 px-2 text-gray-500">—</td>
                <td className="text-right py-2 pl-2 text-orange-400">{formatManwon(corp.employerInsAnnual.total)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 pr-3 text-gray-300">소득세(연·배당관련){personal.marginalRate > 0 && <span className="text-[10px] text-gray-600 block">한계 {(personal.marginalRate * 100).toFixed(0)}%</span>}</td>
                <td className="text-right py-2 px-2 text-red-400">{formatManwon(beforeTax)}</td>
                <td className="text-right py-2 pl-2 text-emerald-400">{formatManwon(afterTax)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 pr-3 text-gray-300">법인 유지비(연)</td>
                <td className="text-right py-2 px-2 text-gray-500">—</td>
                <td className="text-right py-2 pl-2 text-yellow-400">{formatManwon(corp.maintAnnual)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 pr-3 text-gray-300">자녀 승계(증여/상속 추정)</td>
                <td className="text-right py-2 px-2 text-red-400">{formatManwon(personal.giftTax)}</td>
                <td className="text-right py-2 pl-2 text-emerald-400">배당 출처 (별도 증여세 0)*</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-gray-300">초기 비용(설립/명의)</td>
                <td className="text-right py-2 px-2 text-gray-500">0</td>
                <td className="text-right py-2 pl-2 text-yellow-400">{formatManwon(plan.setupCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-600 mt-2">* 지분 증여(자본금 출자분)는 별도 증여세 공제 한도 적용. 승계는 대표직 승계·가업상속공제 등 사례별로 크게 달라짐.</p>
        <div className="mt-2 pt-2 border-t border-gray-700 text-[11px] text-gray-500 leading-relaxed">
          <span className="text-gray-400">비교 가정(자동 표시):</span>{' '}
          개인명의 지역건보 {formatManwon(plan.personalHealthAnnual)}/년 ·
          승계 비교 재산액 {formatManwon(plan.giftTaxBase)} ·
          법인 설립비 {formatManwon(plan.setupCost)}
          <span className="text-gray-600"> (변경은 '세제 · 비교 파라미터'에서)</span>
        </div>
      </Expander>

      {/* 2상 비용 비교 */}
      <Expander title="📊 2상 비용 비교 (가수금 중 vs 후)" badge={`증가 ${formatManwon(twoPhase.diff)}/연`}>
        <Section>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            같은 생활비 인출 기준. Phase1(가수금 회수=비과세) → Phase2(가수금 소진 후, 배당=과세) 전환 시 세금 증가분.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 pr-3">구분</th>
                <th className="text-right py-2 px-2">Phase1(가수금 중)</th>
                <th className="text-right py-2 pl-2">Phase2(가수금 후)</th>
              </tr></thead>
              <tbody>
                <tr className="border-b border-gray-700/50">
                  <td className="py-2 pr-3 text-gray-300">법인세(연)</td>
                  <td className="text-right py-2 px-2 text-gray-200">{formatManwon(twoPhase.corpTax)}</td>
                  <td className="text-right py-2 pl-2 text-gray-200">{formatManwon(twoPhase.corpTax)}</td>
                </tr>
                <tr className="border-b border-gray-700/50">
                  <td className="py-2 pr-3 text-gray-300">건보(연·{salariedCount(plan)}인)</td>
                  <td className="text-right py-2 px-2 text-gray-200">{formatManwon(twoPhase.corpHealth)}</td>
                  <td className="text-right py-2 pl-2 text-gray-200">{formatManwon(twoPhase.corpHealth)}</td>
                </tr>
                <tr className="border-b border-gray-700/50">
                  <td className="py-2 pr-3 text-gray-300">급여소득세(연)</td>
                  <td className="text-right py-2 px-2 text-gray-200">{formatManwon(twoPhase.salaryTax)}</td>
                  <td className="text-right py-2 pl-2 text-gray-200">{formatManwon(twoPhase.salaryTax)}</td>
                </tr>
                <tr className="border-b border-gray-700/50">
                  <td className="py-2 pr-3 text-gray-300">배당소득세(15.4%)</td>
                  <td className="text-right py-2 px-2 text-gray-500">—</td>
                  <td className="text-right py-2 pl-2 text-red-400">{formatManwon(twoPhase.dividendTax)}</td>
                </tr>
                {twoPhase.combinedExtra > 0 && (
                  <tr className="border-b border-gray-700/50">
                    <td className="py-2 pr-3 text-gray-300">종합과세(초과분) <span className="text-[10px] text-gray-600">한계 {(twoPhase.marginalRate * 100).toFixed(0)}%</span></td>
                    <td className="text-right py-2 px-2 text-gray-500">—</td>
                    <td className="text-right py-2 pl-2 text-red-400">{formatManwon(twoPhase.combinedExtra)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-600">
                  <td className="py-2 pr-3 text-gray-100 font-bold">총비용(연)</td>
                  <td className="text-right py-2 px-2 text-gray-100 font-bold">{formatManwon(twoPhase.cost1)}</td>
                  <td className="text-right py-2 pl-2 text-red-400 font-bold">{formatManwon(twoPhase.cost2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-600 mt-2">
            Phase2 배당 인출(연 {formatManwon(twoPhase.dividendDist)})에 배당세+종합과세({plan.tax.finIncomeCombinedThr > 0 ? formatManwon(plan.tax.finIncomeCombinedThr) : '2천만'} 초과 시) 추가. 급여소득세·종합 한계는 규정 복잡·연도별 → 세무사 확인.
          </p>
        </Section>
      </Expander>

      {/* 자녀 자금출처 */}
      <Expander title="📊 자녀 자금출처 시뮬" badge={`권고 배당총액 ${formatManwon(recommend)}`}>
        <Section>
          <Row label="시뮬 연수"><NumInput value={sonYears} onChange={setSonYears} suffix="년" /></Row>
          <p className="text-[11px] text-blue-400/90">
            아들 건보 마진 한계({plan.sonEmployed ? '2천만' : '1천만'})에 맞춘 권고 연 배당총액 ≈ {formatManwon(recommend)}.
            현재 설정({formatManwon(grossDividend(plan))})에서 아들 세후 연 {formatManwon(corp.perShare.son.net)}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-2 pr-3">연도</th>
                <th className="text-right py-2 px-2">아들 배당(세후)</th>
                <th className="text-right py-2 pl-2">누적(자금출처)</th>
              </tr></thead>
              <tbody>
                {accum.map((r) => (
                  <tr key={r.year} className="border-b border-gray-700/50">
                    <td className="py-2 pr-3 text-gray-300">{r.year}</td>
                    <td className="text-right py-2 px-2 text-emerald-400">{formatManwon(r.sonDividend)}</td>
                    <td className="text-right py-2 pl-2 text-gray-100 font-semibold">{formatManwon(r.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Expander>

      {/* 세제 · 비교 파라미터 (고급) */}
      <Expander title="⚙️ 세제 · 비교 파라미터 (고급)">
        <Section>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            기본값이 들어있으니 그대로 써도 됨. 본인 상황에 맞추려면 여기서 편집. 모든 수치는 추정치.
          </p>
          <p className="text-xs text-gray-400 pt-2">비교 가정·운영비</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="개인명의 지역건보(연)"><AmountInput value={plan.personalHealthAnnual} onChange={(v) => update('personalHealthAnnual', v)} /></Field>
            <Field label="승계 비교 재산액"><AmountInput value={plan.giftTaxBase} onChange={(v) => update('giftTaxBase', v)} /></Field>
            <Field label="법인 설립비(초기)"><AmountInput value={plan.setupCost} onChange={(v) => update('setupCost', v)} /></Field>
            <Field label="법인 연 유지비(세무기장 등)"><AmountInput value={plan.annualMaintCost} onChange={(v) => update('annualMaintCost', v)} /></Field>
          </div>
          <p className="text-xs text-gray-400 pt-3">세율·공식</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="법인세율(2억 이하)"><NumInput value={plan.tax.corpTaxRateLow * 100} onChange={(v) => updateTax('corpTaxRateLow', v / 100)} suffix="%" /></Field>
            <Field label="법인세율(2억 초과)"><NumInput value={plan.tax.corpTaxRateMid * 100} onChange={(v) => updateTax('corpTaxRateMid', v / 100)} suffix="%" /></Field>
            <Field label="법인세 구분 기준"><AmountInput value={plan.tax.corpTaxThreshold} onChange={(v) => updateTax('corpTaxThreshold', v)} /></Field>
            <Field label="배당소득세율"><NumInput value={plan.tax.dividendTaxRate * 100} onChange={(v) => updateTax('dividendTaxRate', v / 100)} suffix="%" /></Field>
            <Field label="금융소득종합과세 기준(연)"><AmountInput value={plan.tax.finIncomeCombinedThr} onChange={(v) => updateTax('finIncomeCombinedThr', v)} /></Field>
            <Field label="자녀 승계 세율(추정)"><NumInput value={plan.tax.giftTaxRate * 100} onChange={(v) => updateTax('giftTaxRate', v / 100)} suffix="%" /></Field>
          </div>
          <p className="text-xs text-gray-400 pt-3">종합소득세 누진구간 (자동 적용)</p>
          <div className="text-[11px] text-gray-500 space-y-0.5 bg-gray-900/50 rounded-lg p-3">
            <p>~1,400만: 6% / ~5,000만: 15% / ~8,800만: 24%</p>
            <p>~1.5억: 35% / 1.5억~: 38% (한국 종합소득세)</p>
          </div>
        </Section>
      </Expander>
    </div>
  )
}
